import { Image } from "canvas";
import errorCorrectionPercents from "../constants/errorCorrectionPercents";
import gradientTypes from "../constants/gradientTypes";
import shapeTypes from "../constants/shapeTypes";
import calculateImageSize, { ImageSizeResult } from "../tools/calculateImageSize";
import mergeDeep from "../tools/merge";
import { createCircleElement, createDonutElement } from "../tools/path.utils";
import sanitizeOptions from "../tools/sanitizeOptions";
import toDataUrl from "../tools/toDataUrl";
import { Directions, Gradient, QRCode, Window } from "../types";
import { drawerFactory, getDrawDirections, PathDrawer } from "./PathDrawer";
import defaultOptions, { RequiredOptions } from "./QROptions";

const squareMask = [
  [true, true, true, true, true, true, true],
  [true, false, false, false, false, false, true],
  [true, false, false, false, false, false, true],
  [true, false, false, false, false, false, true],
  [true, false, false, false, false, false, true],
  [true, false, false, false, false, false, true],
  [true, true, true, true, true, true, true]
];

const dotMask = [
  [false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false],
  [false, false, true, true, true, false, false],
  [false, false, true, true, true, false, false],
  [false, false, true, true, true, false, false],
  [false, false, false, false, false, false, false],
  [false, false, false, false, false, false, false]
];

export default class QRSVGBuilder {
  _window: Window;
  _element: SVGElement;
  _defs: SVGElement;
  _options: RequiredOptions;
  _qr: QRCode;
  _image?: HTMLImageElement | Image;
  _imageUri?: string;
  _instanceId: number;
  _dotSize: number;
  _viewboxSize: { width: number; height: number };

  static instanceCount = 0;

  constructor(options: RequiredOptions, window: Window, qr: QRCode) {
    this._window = window;
    this._options = sanitizeOptions(mergeDeep(defaultOptions, options) as RequiredOptions);
    this._qr = qr;
    this._instanceId = QRSVGBuilder.instanceCount++;
    this._dotSize = 4;
    this._imageUri = options.image;

    const circleMultiplier = this._options.shape === shapeTypes.circle ? Math.sqrt(2) : 1;
    const aspectRatio = this._options.width / this._options.height;
    const size = (this.moduleCount() * this._dotSize + this._options.margin * 2) * circleMultiplier;
    this._viewboxSize = { width: Math.max(size * aspectRatio, size), height: Math.max(size / aspectRatio, size) };

    const svgRoot = this._window.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgRoot.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    if (!options.dotsOptions.roundSize) {
      svgRoot.setAttribute("shape-rendering", "crispEdges");
    }
    svgRoot.setAttribute("viewBox", `0 0 ${this.viewboxSize().width} ${this.viewboxSize().height}`);
    this._defs = this._window.document.createElementNS("http://www.w3.org/2000/svg", "defs");
    svgRoot.appendChild(this._defs);
    this._element = svgRoot;
  }

  dotSize(dotSize: number): QRSVGBuilder {
    this._dotSize = dotSize;
    return this;
  }

  element(): SVGElement {
    return this._element;
  }

  moduleCount(): number {
    return this._qr.getModuleCount();
  }

  viewboxSize(): { width: number; height: number } {
    return this._viewboxSize;
  }

  async drawQR(): Promise<void> {
    let drawImageSize = {
      hideXDots: 0,
      hideYDots: 0,
      width: 0,
      height: 0
    };

    if (this._options.image) {
      //We need it to get image size
      await this.loadImage();
      if (!this._image) return;
      const { imageOptions, qrOptions } = this._options;
      const coverLevel = imageOptions.imageSize * errorCorrectionPercents[qrOptions.errorCorrectionLevel];
      const maxHiddenDots = Math.floor(coverLevel * this.moduleCount() * this.moduleCount());

      drawImageSize = calculateImageSize({
        originalWidth: this._image.width,
        originalHeight: this._image.height,
        maxHiddenDots,
        maxHiddenAxisDots: this.moduleCount() - 14,
        dotSize: this._dotSize
      });
    }

    const dotsMask = this.buildDotsMask(drawImageSize);

    this.drawBackground({ backgroundOptions: this._options.backgroundOptions });

    this.drawMainComponents(dotsMask);

    this.drawCorners();

    if (this._options.image) {
      await this.drawImage({
        width: drawImageSize.width,
        height: drawImageSize.height,
        count: this.moduleCount(),
        dotSize: this._dotSize
      });
    }
  }

  drawMainComponents(dotsMask: boolean[][]): void {
    const { width, height } = this.viewboxSize();

    const fillColor =
      this.createFillColor({
        options: this._options.dotsOptions,
        additionalRotation: 0,
        x: 0,
        y: 0,
        height,
        width
      }) ?? "#000";

    const offset = {
      dx: this._roundSize((width - dotsMask.length * this._dotSize) / 2),
      dy: this._roundSize((height - dotsMask.length * this._dotSize) / 2)
    };

    if (this._options.dotsOptions.type === "dots") {
      this.drawSingleDots(dotsMask, offset, fillColor);
    } else {
      this.drawComponents(dotsMask, offset, fillColor, drawerFactory(this._options.dotsOptions.type, this._dotSize));
    }
  }

  drawComponents(
    dotsMask: boolean[][],
    offset: { dx: number; dy: number },
    fillColor: string,
    drawer: PathDrawer
  ): void {
    const { components, ids } = this.buildConnectedComponents(dotsMask);
    const { ids: backgroundIds } = this.buildConnectedComponents(dotsMask, true, 8);

    const paths = new Map<number, string>();
    ids.forEach((start, id) => {
      const path = this.renderComponentToPath(id, components, offset, start, drawer, false);
      paths.set(id, path);
    });

    const backgroundPathsForComponent = new Map<number, number[]>();
    backgroundIds.forEach((startPosition, id) => {
      const surroundingComponent = components[startPosition.row][startPosition.col - 1];
      if (!surroundingComponent || id <= 1) {
        return;
      }
      if (!backgroundPathsForComponent.has(surroundingComponent)) {
        backgroundPathsForComponent.set(surroundingComponent, []);
      }
      backgroundPathsForComponent.get(surroundingComponent)!.push(id);
    });

    for (const [id, path] of paths) {
      const element = this._window.document.createElementNS("http://www.w3.org/2000/svg", "path");
      element.setAttribute("fill-rule", "evenodd");
      let fullPath = path;
      const backgroundPaths = backgroundPathsForComponent.get(id) ?? [];
      backgroundPaths.forEach((backgroundPathId) => {
        const start = backgroundIds.get(backgroundPathId)!;
        fullPath += this.renderComponentToPath(
          id,
          components,
          offset,
          // Since all backgroundComponents are fully surrounded by the main component, we can move to the top left corner
          { row: start.row - 1, col: start.col - 1 },
          drawer,
          true
        );
      });
      element.setAttribute("d", fullPath);
      element.setAttribute("fill", fillColor);

      this._element.appendChild(element);
    }
  }

  drawSingleDots(dotsMask: boolean[][], offset: { dx: number; dy: number }, fillColor: string): void {
    for (let row = 0; row < dotsMask.length; row++) {
      for (let col = 0; col < dotsMask[row].length; col++) {
        if (dotsMask[row][col]) {
          const x = offset.dx + col * this._dotSize;
          const y = offset.dy + row * this._dotSize;

          const circle = createCircleElement(this._window, { dx: x, dy: y }, this._dotSize);
          circle.setAttribute("fill", fillColor);
          this._element.appendChild(circle);
        }
      }
    }
  }

  drawBackground({ backgroundOptions }: { backgroundOptions?: RequiredOptions["backgroundOptions"] }): void {
    const { width, height } = this.viewboxSize();
    const gradientOptions = backgroundOptions?.gradient;
    const color = backgroundOptions?.color;

    if (gradientOptions || color) {
      const rect = this._window.document.createElementNS("http://www.w3.org/2000/svg", "rect");

      if (backgroundOptions?.round) {
        const minDim = Math.min(width, height);
        rect.setAttribute("rx", String((minDim / 2) * backgroundOptions.round));
        rect.setAttribute("x", String(this._roundSize((width - minDim) / 2)));
        rect.setAttribute("y", String(this._roundSize((height - minDim) / 2)));
        rect.setAttribute("width", String(minDim));
        rect.setAttribute("height", String(minDim));
      } else {
        rect.setAttribute("width", String(width));
        rect.setAttribute("height", String(height));
      }

      const fillColor = this.createFillColor({
        options: backgroundOptions,
        additionalRotation: 0,
        x: 0,
        y: 0,
        height,
        width
      });

      if (fillColor) {
        rect.setAttribute("fill", fillColor);
      }
      this._element.appendChild(rect);
    }
  }

  buildDotsMask(centerImageSize: ImageSizeResult): boolean[][] {
    const mask: boolean[][] = [];
    const count = this.moduleCount();

    const filter = (row: number, col: number): boolean => {
      if (this._options.imageOptions.hideBackgroundDots) {
        if (
          row >= (this.moduleCount() - centerImageSize.hideYDots) / 2 &&
          row < (this.moduleCount() + centerImageSize.hideYDots) / 2 &&
          col >= (this.moduleCount() - centerImageSize.hideXDots) / 2 &&
          col < (this.moduleCount() + centerImageSize.hideXDots) / 2
        ) {
          return false;
        }
      }

      if (
        squareMask[row]?.[col] ||
        squareMask[row - this.moduleCount() + 7]?.[col] ||
        squareMask[row]?.[col - this.moduleCount() + 7]
      ) {
        return false;
      }

      if (
        dotMask[row]?.[col] ||
        dotMask[row - this.moduleCount() + 7]?.[col] ||
        dotMask[row]?.[col - this.moduleCount() + 7]
      ) {
        return false;
      }

      return true;
    };

    for (let row = 0; row < count; row++) {
      mask[row] = [];
      for (let col = 0; col < count; col++) {
        mask[row][col] = this._qr.isDark(row, col) && filter(row, col);
      }
    }

    if (this._options.shape === shapeTypes.circle) {
      return this.expandDotsMaskWithCircle(mask);
    }
    return mask;
  }

  buildConnectedComponents(
    dotsMask: boolean[][],
    invert = false,
    connectedness: 4 | 8 = 4
  ): { components: (number | null)[][]; ids: Map<number, { row: number; col: number }> } {
    const components: (number | null)[][] = [];

    let currentComponent = 1;
    const equivalences: Map<number, Set<number>> = new Map();

    for (let row = 0; row < dotsMask.length; row++) {
      components[row] = [];
      for (let col = 0; col < dotsMask[row].length; col++) {
        if (dotsMask[row][col] === invert) {
          components[row][col] = null;
          continue;
        }

        const isEdge = col === 0 || row === 0 || col === dotsMask[row].length - 1 || row === dotsMask.length - 1;
        const leftComponent = col > 0 ? components[row][col - 1] : null;
        const topComponent = row > 0 ? components[row - 1][col] : null;
        const topLeftComponent = col > 0 && row > 0 && connectedness === 8 ? components[row - 1][col - 1] : null;
        const topRightComponent =
          col < dotsMask.length - 1 && row > 0 && connectedness === 8 ? components[row - 1][col + 1] : null;
        const validIds = [
          leftComponent,
          topComponent,
          topLeftComponent,
          topRightComponent,
          isEdge && connectedness === 8 ? 1 : null
        ].filter((n) => n !== null);

        if (validIds.length === 0) {
          currentComponent++;
          components[row][col] = currentComponent;
          continue;
        } else if (validIds.length === 1) {
          components[row][col] = validIds[0];
          continue;
        }

        const minComponent = Math.min(...validIds);
        components[row][col] = minComponent;
        if (!equivalences.has(minComponent)) {
          equivalences.set(minComponent, new Set([minComponent]));
        }

        const equivalenceClass = equivalences.get(minComponent)!;
        for (const id of validIds) {
          if (!equivalenceClass.has(id)) {
            for (const equivalenceId of equivalences.get(id) ?? [id]) {
              equivalenceClass.add(equivalenceId);
              equivalences.set(equivalenceId, equivalenceClass);
            }
          }
        }
      }
    }

    const ids: Map<number, { row: number; col: number }> = new Map();

    // Resolve aliases
    for (let row = 0; row < components.length; row++) {
      for (let col = 0; col < components[row].length; col++) {
        const value = components[row][col];
        if (value) {
          const id = Math.min(...Array.from(equivalences.get(value) ?? [value]));
          components[row][col] = id;
          if (!ids.has(id)) {
            ids.set(id, { row, col });
          }
        }
      }
    }

    // console.log(components.map((r) => r.map((e) => String(e ?? 0).padStart(3, " ")).join(" ")).join("\n"));

    return { components, ids };
  }

  renderComponentToPath(
    componentId: number,
    components: (number | null)[][],
    offset: { dx: number; dy: number },
    start: { row: number; col: number },
    drawer: PathDrawer,
    moveRight: boolean
  ): string {
    let path = `M ${start.col * this._dotSize + offset.dx} ${start.row * this._dotSize + offset.dy} `;
    let origin: Directions = "top";
    let nextDirection: Directions | undefined = undefined;
    const current: typeof start = { ...start };

    if (components[current.row]?.[current.col + 1] === componentId && !moveRight) {
      // Start from the right
      origin = "right";
      path += `m ${this._dotSize} 0`;
    } else if (components[current.row + 1]?.[current.col] === componentId) {
      // Start from the bottom (will always happen for backgroundComponents)
      origin = "bottom";
      path += `m ${this._dotSize} ${this._dotSize}`;
    }

    const originalOrigin = origin;
    const directions = getDrawDirections(drawer);

    do {
      const hasLeft = components[current.row]?.[current.col - 1] === componentId;
      const hasRight = components[current.row]?.[current.col + 1] === componentId;
      const hasTop = components[current.row - 1]?.[current.col] === componentId;
      const hasBottom = components[current.row + 1]?.[current.col] === componentId;
      nextDirection = this.determineNextDirection(origin, hasLeft, hasRight, hasTop, hasBottom);
      if (!nextDirection) {
        // A single dot
        path += drawer.singleDot();
        break;
      }

      path += directions[origin][nextDirection]?.() ?? "";

      switch (nextDirection) {
        case "left":
          current.col -= 1;
          break;
        case "bottom":
          current.row += 1;
          break;
        case "right":
          current.col += 1;
          break;
        case "top":
          current.row -= 1;
          break;
      }

      origin = ({ top: "bottom", right: "left", bottom: "top", left: "right" } as const)[nextDirection];
    } while (current.row !== start.row || current.col !== start.col || originalOrigin !== origin);

    return path;
  }

  determineNextDirection(
    origin: Directions,
    hasLeft: boolean,
    hasRight: boolean,
    hasTop: boolean,
    hasBottom: boolean
  ): Directions | undefined {
    const rotationOrder = ["left", "bottom", "right", "top", "left", "bottom", "right", "top"] as const;
    const startIndex = rotationOrder.indexOf(origin) + 1;
    const options = [hasLeft, hasBottom, hasRight, hasTop];
    return rotationOrder.slice(startIndex).find((_, index) => options[(startIndex + index) % 4]);
  }

  expandDotsMaskWithCircle(dotsMask: boolean[][]): boolean[][] {
    const count = this.moduleCount();
    const { width, height } = this.viewboxSize();

    const additionalDots = this._roundSize(
      ((Math.min(width, height) - this._options.margin * 2) / this._dotSize - count) / 2
    );
    const fakeCount = count + additionalDots * 2;
    const circularDotsMask: boolean[][] = [];
    const center = this._roundSize(fakeCount / 2);

    for (let row = 0; row < fakeCount; row++) {
      circularDotsMask[row] = [];
      for (let col = 0; col < fakeCount; col++) {
        if (
          row >= additionalDots - 1 &&
          row <= fakeCount - additionalDots &&
          col >= additionalDots - 1 &&
          col <= fakeCount - additionalDots
        ) {
          circularDotsMask[row][col] = dotsMask[row - additionalDots]?.[col - additionalDots] ?? false;
          continue;
        }

        if (Math.sqrt((row - center) * (row - center) + (col - center) * (col - center)) > center) {
          circularDotsMask[row][col] = false;
          continue;
        }

        //Get random dots from QR code to show it outside of QR code
        circularDotsMask[row][col] = this._qr.isDark(
          col - 2 * additionalDots < 0 ? col : col >= count ? col - 2 * additionalDots : col - additionalDots,
          row - 2 * additionalDots < 0 ? row : row >= count ? row - 2 * additionalDots : row - additionalDots
        );
      }
    }

    return circularDotsMask;
  }

  drawCorners(): void {
    const { width, height } = this.viewboxSize();
    const options = this._options;

    const count = this._qr.getModuleCount();
    const dotSize = this._dotSize;
    const cornersSquareSize = dotSize * 7;
    const cornersDotSize = dotSize * 3;
    const xBeginning = this._roundSize((width - count * dotSize) / 2);
    const yBeginning = this._roundSize((height - count * dotSize) / 2);

    const cornerSquareType = this._options.cornersSquareOptions?.type || this._options.dotsOptions.type;

    const locations = [
      [0, 0, 0],
      [1, 0, Math.PI / 2],
      [0, 1, -Math.PI / 2]
    ].map(([column, row, rotation]) => {
      const x = xBeginning + column * dotSize * (count - 7);
      const y = yBeginning + row * dotSize * (count - 7);
      const fillColor =
        this.createFillColor({
          options: options.cornersSquareOptions,
          additionalRotation: rotation,
          x,
          y,
          height: cornersSquareSize,
          width: cornersSquareSize
        }) ?? options.dotsOptions.color;
      return { x, y, fillColor };
    });

    if (cornerSquareType === "dots") {
      for (const { x, y, fillColor } of locations) {
        this.drawSingleDots(squareMask, { dx: x, dy: y }, fillColor);
      }
    } else if (cornerSquareType === "dot") {
      for (const { x, y, fillColor } of locations) {
        const donut = createDonutElement(this._window, { dx: x, dy: y }, cornersSquareSize, dotSize);
        donut.setAttribute("fill", fillColor);
        this._element.appendChild(donut);
      }
    } else {
      const cornerSquareDrawer = drawerFactory(cornerSquareType, this._dotSize);
      for (const { x, y, fillColor } of locations) {
        this.drawComponents(squareMask, { dx: x, dy: y }, fillColor, cornerSquareDrawer);
      }
    }

    const cornerDotType = this._options.cornersDotOptions?.type || this._options.dotsOptions.type;

    const cornerDotLocations = [
      [0, 0, 0],
      [1, 0, Math.PI / 2],
      [0, 1, -Math.PI / 2]
    ].map(([column, row, rotation]) => {
      const x = xBeginning + column * dotSize * (count - 7);
      const y = yBeginning + row * dotSize * (count - 7);
      const fillColor =
        this.createFillColor({
          options: options.cornersDotOptions,
          additionalRotation: rotation,
          x,
          y,
          height: cornersDotSize,
          width: cornersDotSize
        }) ?? options.dotsOptions.color;
      return { x, y, fillColor };
    });

    if (cornerDotType === "dots") {
      for (const { x, y, fillColor } of cornerDotLocations) {
        this.drawSingleDots(dotMask, { dx: x, dy: y }, fillColor);
      }
    } else if (cornerDotType === "dot") {
      for (const { x, y, fillColor } of cornerDotLocations) {
        const donut = createCircleElement(this._window, { dx: x + dotSize * 2, dy: y + dotSize * 2 }, cornersDotSize);
        donut.setAttribute("fill", fillColor);
        this._element.appendChild(donut);
      }
    } else {
      const cornerDotDrawer = drawerFactory(cornerDotType, this._dotSize);
      for (const { x, y, fillColor } of cornerDotLocations) {
        this.drawComponents(dotMask, { dx: x, dy: y }, fillColor, cornerDotDrawer);
      }
    }
  }

  loadImage(): Promise<void> {
    return new Promise((resolve, reject) => {
      const options = this._options;

      if (!options.image) {
        return reject("Image is not defined");
      }

      if (options.nodeCanvas?.loadImage) {
        options.nodeCanvas
          .loadImage(options.image)
          .then((image: Image) => {
            this._image = image;
            if (this._options.imageOptions.saveAsBlob) {
              const canvas = options.nodeCanvas?.createCanvas(this._image.width, this._image.height);
              canvas?.getContext("2d")?.drawImage(image, 0, 0);
              this._imageUri = canvas?.toDataURL();
            }
            resolve();
          })
          .catch(reject);
      } else {
        const image = new this._window.Image();

        if (typeof options.imageOptions.crossOrigin === "string") {
          image.crossOrigin = options.imageOptions.crossOrigin;
        }

        this._image = image;
        image.onload = async () => {
          if (this._options.imageOptions.saveAsBlob) {
            this._imageUri = await toDataUrl(options.image || "", this._window);
          }
          resolve();
        };
        image.src = options.image;
      }
    });
  }

  async drawImage({
    width,
    height,
    count,
    dotSize
  }: {
    width: number;
    height: number;
    count: number;
    dotSize: number;
  }): Promise<void> {
    const options = this._options;
    const { width: viewBoxWidth, height: viewBoxHeight } = this.viewboxSize();
    const xBeginning = this._roundSize((viewBoxWidth - count * dotSize) / 2);
    const yBeginning = this._roundSize((viewBoxHeight - count * dotSize) / 2);
    const dx = xBeginning + this._roundSize(options.imageOptions.margin + (count * dotSize - width) / 2);
    const dy = yBeginning + this._roundSize(options.imageOptions.margin + (count * dotSize - height) / 2);
    const dw = width - options.imageOptions.margin * 2;
    const dh = height - options.imageOptions.margin * 2;

    const image = this._window.document.createElementNS("http://www.w3.org/2000/svg", "image");
    image.setAttribute("href", this._imageUri || "");
    image.setAttribute("xlink:href", this._imageUri || "");
    image.setAttribute("x", String(dx));
    image.setAttribute("y", String(dy));
    image.setAttribute("width", `${dw}px`);
    image.setAttribute("height", `${dh}px`);

    this._element.appendChild(image);
  }

  createFillColor({
    options,
    additionalRotation,
    x,
    y,
    height,
    width
  }: {
    options?: { gradient?: Gradient; color?: string };
    additionalRotation: number;
    x: number;
    y: number;
    height: number;
    width: number;
  }): string | undefined {
    const size = width > height ? width : height;
    const { gradient, color } = options ?? {};

    if (gradient) {
      const gradientId = `gradient-${Math.random().toString(36)}`;
      let gradientElement: SVGElement;
      if (gradient.type === gradientTypes.radial) {
        gradientElement = this._window.document.createElementNS("http://www.w3.org/2000/svg", "radialGradient");
        gradientElement.setAttribute("id", gradientId);
        gradientElement.setAttribute("gradientUnits", "userSpaceOnUse");
        gradientElement.setAttribute("fx", String(x + width / 2));
        gradientElement.setAttribute("fy", String(y + height / 2));
        gradientElement.setAttribute("cx", String(x + width / 2));
        gradientElement.setAttribute("cy", String(y + height / 2));
        gradientElement.setAttribute("r", String(size / 2));
      } else {
        const rotation = ((gradient.rotation || 0) + additionalRotation) % (2 * Math.PI);
        const positiveRotation = (rotation + 2 * Math.PI) % (2 * Math.PI);
        let x0 = x + width / 2;
        let y0 = y + height / 2;
        let x1 = x + width / 2;
        let y1 = y + height / 2;

        if (
          (positiveRotation >= 0 && positiveRotation <= 0.25 * Math.PI) ||
          (positiveRotation > 1.75 * Math.PI && positiveRotation <= 2 * Math.PI)
        ) {
          x0 = x0 - width / 2;
          y0 = y0 - (height / 2) * Math.tan(rotation);
          x1 = x1 + width / 2;
          y1 = y1 + (height / 2) * Math.tan(rotation);
        } else if (positiveRotation > 0.25 * Math.PI && positiveRotation <= 0.75 * Math.PI) {
          y0 = y0 - height / 2;
          x0 = x0 - width / 2 / Math.tan(rotation);
          y1 = y1 + height / 2;
          x1 = x1 + width / 2 / Math.tan(rotation);
        } else if (positiveRotation > 0.75 * Math.PI && positiveRotation <= 1.25 * Math.PI) {
          x0 = x0 + width / 2;
          y0 = y0 + (height / 2) * Math.tan(rotation);
          x1 = x1 - width / 2;
          y1 = y1 - (height / 2) * Math.tan(rotation);
        } else if (positiveRotation > 1.25 * Math.PI && positiveRotation <= 1.75 * Math.PI) {
          y0 = y0 + height / 2;
          x0 = x0 + width / 2 / Math.tan(rotation);
          y1 = y1 - height / 2;
          x1 = x1 - width / 2 / Math.tan(rotation);
        }

        gradientElement = this._window.document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        gradientElement.setAttribute("id", gradientId);
        gradientElement.setAttribute("gradientUnits", "userSpaceOnUse");
        gradientElement.setAttribute("x1", String(Math.round(x0)));
        gradientElement.setAttribute("y1", String(Math.round(y0)));
        gradientElement.setAttribute("x2", String(Math.round(x1)));
        gradientElement.setAttribute("y2", String(Math.round(y1)));
      }

      gradient.colorStops.forEach(({ offset, color }: { offset: number; color: string }) => {
        const stop = this._window.document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop.setAttribute("offset", `${100 * offset}%`);
        stop.setAttribute("stop-color", color);
        gradientElement.appendChild(stop);
      });

      this._defs.appendChild(gradientElement);

      return `url('#${gradientId}')`;
    }

    return color;
  }

  _roundSize = (value: number) => {
    if (this._options.dotsOptions.roundSize) {
      return Math.floor(value);
    }
    return value;
  };
}
