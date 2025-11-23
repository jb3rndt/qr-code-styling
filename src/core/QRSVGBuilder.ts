import { Image } from "canvas";
import errorCorrectionPercents from "../constants/errorCorrectionPercents";
import gradientTypes from "../constants/gradientTypes";
import shapeTypes from "../constants/shapeTypes";
import QRCornerDot, { availableCornerDotTypes } from "../figures/cornerDot/QRCornerDot";
import QRCornerSquare, { availableCornerSquareTypes } from "../figures/cornerSquare/QRCornerSquare";
import QRDot from "../figures/dot/QRDot";
import calculateImageSize from "../tools/calculateImageSize";
import mergeDeep from "../tools/merge";
import sanitizeOptions from "../tools/sanitizeOptions";
import toDataUrl from "../tools/toDataUrl";
import { Directions4, DotType, FilterFunction, Gradient, QRCode, Window } from "../types";
import defaultOptions, { RequiredOptions } from "./QROptions";

const squareMask = [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1]
];

const dotMask = [
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 1, 1, 1, 0, 0],
  [0, 0, 1, 1, 1, 0, 0],
  [0, 0, 1, 1, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0]
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

    let dotsMask = this.buildDotsMask((row: number, col: number): boolean => {
      if (this._options.imageOptions.hideBackgroundDots) {
        if (
          row >= (this.moduleCount() - drawImageSize.hideYDots) / 2 &&
          row < (this.moduleCount() + drawImageSize.hideYDots) / 2 &&
          col >= (this.moduleCount() - drawImageSize.hideXDots) / 2 &&
          col < (this.moduleCount() + drawImageSize.hideXDots) / 2
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
    });

    if (this._options.shape === shapeTypes.circle) {
      dotsMask = this.expandDotsMaskWithCircle(dotsMask);
    }

    this.drawBackground({ backgroundOptions: this._options.backgroundOptions });

    const { width, height } = this.viewboxSize();

    const xBeginning = this._roundSize((width - dotsMask.length * this._dotSize) / 2);
    const yBeginning = this._roundSize((height - dotsMask.length * this._dotSize) / 2);

    if (this._options.dotsOptions.type === "dots") {
      this.drawAsSingleDots(dotsMask, {
        dx: xBeginning,
        dy: yBeginning
      });
    } else {
      const { components, ids } = this.buildConnectedComponents(dotsMask);
      const { ids: backgroundIds } = this.buildConnectedComponents(dotsMask, true, 8);

      const paths = new Map<number, string>();
      ids.forEach((start, id) => {
        const path = this.renderComponentToPath(id, components, { dx: xBeginning, dy: yBeginning }, start, false);
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

      const gradientElement = this._newCreateColor({
        options: this._options.dotsOptions?.gradient,
        additionalRotation: 0,
        x: 0,
        y: 0,
        height,
        width,
        name: `dot-color-${this._instanceId}`
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
            {
              dx: xBeginning,
              dy: yBeginning
            },
            // Since all backgroundComponents are fully surrounded by the main component, we can move to the top left corner
            { row: start.row - 1, col: start.col - 1 },
            true
          );
        });
        element.setAttribute("d", fullPath);

        if (gradientElement) {
          element.setAttribute("fill", `url('#background-color-${this._instanceId}')`);
          this._defs.appendChild(gradientElement);
        } else {
          element.setAttribute("fill", this._options.dotsOptions.color || "#fff");
        }
        this._element.appendChild(element);
      }
    }

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

  drawAsSingleDots(dotsMask: boolean[][], offset: { dx: number; dy: number }): void {
    const { width, height } = this.viewboxSize();

    const dot = new QRDot({
      svg: this._element,
      type: this._options.dotsOptions.type,
      window: this._window
    });

    const gradientElement = this._newCreateColor({
      options: this._options.dotsOptions?.gradient,
      additionalRotation: 0,
      x: 0,
      y: 0,
      height,
      width,
      name: `dot-color-${this._instanceId}`
    });

    for (let row = 0; row < dotsMask.length; row++) {
      for (let col = 0; col < dotsMask[row].length; col++) {
        if (!dotsMask[row][col]) {
          continue;
        }

        dot.draw(
          offset.dx + col * this._dotSize,
          offset.dy + row * this._dotSize,
          this._dotSize,
          (xOffset: number, yOffset: number): boolean => {
            if (
              col + xOffset < 0 ||
              row + yOffset < 0 ||
              col + xOffset >= dotsMask[row].length ||
              row + yOffset >= dotsMask.length
            )
              return false;
            return dotsMask[row + yOffset][col + xOffset];
          }
        );

        if (dot._element) {
          if (gradientElement) {
            dot._element.setAttribute("fill", `url('#dot-color-${this._instanceId}')`);
            this._defs.appendChild(gradientElement);
          } else {
            dot._element.setAttribute("fill", this._options.dotsOptions.color || "#fff");
          }
          this._element.appendChild(dot._element);
        }
      }
    }
  }

  drawBackground({ backgroundOptions }: { backgroundOptions?: RequiredOptions["backgroundOptions"] }): void {
    const { width, height } = this.viewboxSize();
    const element = this._element;
    const gradientOptions = backgroundOptions?.gradient;
    const color = backgroundOptions?.color;

    if (!element) {
      return;
    }

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

      const colorId = `background-color-${this._instanceId}`;
      const gradientDefinition = this._newCreateColor({
        options: gradientOptions,
        additionalRotation: 0,
        x: 0,
        y: 0,
        height,
        width,
        name: colorId
      });

      if (gradientDefinition) {
        rect.setAttribute("fill", `url('#${colorId}')`);
        this._defs.appendChild(gradientDefinition);
      } else if (color) {
        rect.setAttribute("fill", color);
      }
      this._element.appendChild(rect);
    }
  }

  buildDotsMask(filter?: FilterFunction): boolean[][] {
    const mask: boolean[][] = [];
    const count = this.moduleCount();

    for (let row = 0; row < count; row++) {
      mask[row] = [];
      for (let col = 0; col < count; col++) {
        mask[row][col] = this._qr.isDark(row, col) && (!filter || filter?.(row, col));
      }
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
    moveRight: boolean
  ): string {
    const directions = this.getDirections();

    let path = `M ${start.col * this._dotSize + offset.dx} ${start.row * this._dotSize + offset.dy} `;
    let origin: Directions4 = "top";
    let nextDirection: Directions4 | undefined = undefined;
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

    do {
      const hasLeft = components[current.row]?.[current.col - 1] === componentId;
      const hasRight = components[current.row]?.[current.col + 1] === componentId;
      const hasTop = components[current.row - 1]?.[current.col] === componentId;
      const hasBottom = components[current.row + 1]?.[current.col] === componentId;
      nextDirection = this.determineNextDirection(origin, hasLeft, hasRight, hasTop, hasBottom);
      if (!nextDirection) {
        // A single dot
        path += this.singleDot(this._dotSize, this._options.dotsOptions.type);
        break;
      }

      path += directions[origin][nextDirection]?.(this._dotSize, this._options.dotsOptions.type) ?? "";

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
    origin: Directions4,
    hasLeft: boolean,
    hasRight: boolean,
    hasTop: boolean,
    hasBottom: boolean
  ): Directions4 | undefined {
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
    const element = this._element;
    const options = this._options;

    if (!element) {
      throw "Element code is not defined";
    }

    const count = this._qr.getModuleCount();
    const dotSize = 4;
    const cornersSquareSize = dotSize * 7;
    const cornersDotSize = dotSize * 3;
    const xBeginning = this._roundSize((width - count * dotSize) / 2);
    const yBeginning = this._roundSize((height - count * dotSize) / 2);

    [
      [0, 0, 0],
      [1, 0, Math.PI / 2],
      [0, 1, -Math.PI / 2]
    ].forEach(([column, row, rotation]) => {
      const x = xBeginning + column * dotSize * (count - 7);
      const y = yBeginning + row * dotSize * (count - 7);
      const gradient = this._newCreateColor({
        options: options.cornersSquareOptions?.gradient,
        additionalRotation: rotation,
        x,
        y,
        height: cornersSquareSize,
        width: cornersSquareSize,
        name: `corners-square-color-${column}-${row}-${this._instanceId}`
      });

      if (
        options.cornersSquareOptions?.type &&
        availableCornerSquareTypes.includes(options.cornersSquareOptions.type)
      ) {
        const cornersSquare = new QRCornerSquare({
          svg: this._element,
          type: options.cornersSquareOptions.type,
          window: this._window
        });

        cornersSquare.draw(x, y, cornersSquareSize, rotation);

        if (cornersSquare._element) {
          if (gradient) {
            cornersSquare._element.setAttribute(
              "fill",
              `url('#corners-square-color-${column}-${row}-${this._instanceId}')`
            );
          } else {
            cornersSquare._element.setAttribute("fill", options.cornersSquareOptions?.color || "#000");
          }
          this._element.appendChild(cornersSquare._element);
        }
      } else {
        const dot = new QRDot({
          svg: this._element,
          type: (options.cornersSquareOptions?.type as DotType) || options.dotsOptions.type,
          window: this._window
        });

        for (let row = 0; row < squareMask.length; row++) {
          for (let col = 0; col < squareMask[row].length; col++) {
            if (!squareMask[row]?.[col]) {
              continue;
            }

            dot.draw(
              x + col * dotSize,
              y + row * dotSize,
              dotSize,
              (xOffset: number, yOffset: number): boolean => !!squareMask[row + yOffset]?.[col + xOffset]
            );

            if (dot._element) {
              if (gradient) {
                dot._element.setAttribute("fill", `url('#corners-square-color-${column}-${row}-${this._instanceId}')`);
              } else {
                dot._element.setAttribute("fill", options.cornersSquareOptions?.color || "#000");
              }
              this._element.appendChild(dot._element);
            }
          }
        }
      }

      const cornerDotGradient = this._newCreateColor({
        options: options.cornersDotOptions?.gradient,
        additionalRotation: rotation,
        x: x + dotSize * 2,
        y: y + dotSize * 2,
        height: cornersDotSize,
        width: cornersDotSize,
        name: `corners-dot-color-${column}-${row}-${this._instanceId}`
      });

      if (options.cornersDotOptions?.type && availableCornerDotTypes.includes(options.cornersDotOptions.type)) {
        const cornersDot = new QRCornerDot({
          svg: this._element,
          type: options.cornersDotOptions.type,
          window: this._window
        });

        cornersDot.draw(x + dotSize * 2, y + dotSize * 2, cornersDotSize, rotation);

        if (cornersDot._element) {
          if (cornerDotGradient) {
            cornersDot._element.setAttribute("fill", `url('#corners-dot-color-${column}-${row}-${this._instanceId}')`);
          } else {
            cornersDot._element.setAttribute("fill", options.cornersDotOptions?.color || "#000");
          }
          this._element.appendChild(cornersDot._element);
        }
      } else {
        const dot = new QRDot({
          svg: this._element,
          type: (options.cornersDotOptions?.type as DotType) || options.dotsOptions.type,
          window: this._window
        });

        for (let row = 0; row < dotMask.length; row++) {
          for (let col = 0; col < dotMask[row].length; col++) {
            if (!dotMask[row]?.[col]) {
              continue;
            }

            dot.draw(
              x + col * dotSize,
              y + row * dotSize,
              dotSize,
              (xOffset: number, yOffset: number): boolean => !!dotMask[row + yOffset]?.[col + xOffset]
            );

            if (dot._element) {
              if (cornerDotGradient) {
                dot._element.setAttribute("fill", `url('#corners-dot-color-${column}-${row}-${this._instanceId}')`);
              } else {
                dot._element.setAttribute("fill", options.cornersDotOptions?.color || "#000");
              }
              this._element.appendChild(dot._element);
            }
          }
        }
      }
    });
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
    const xBeginning = this._roundSize((options.width - count * dotSize) / 2);
    const yBeginning = this._roundSize((options.height - count * dotSize) / 2);
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

  _newCreateColor({
    options,
    additionalRotation,
    x,
    y,
    height,
    width,
    name
  }: {
    options?: Gradient;
    additionalRotation: number;
    x: number;
    y: number;
    height: number;
    width: number;
    name: string;
  }): SVGElement | null {
    const size = width > height ? width : height;

    if (options) {
      let gradient: SVGElement;
      if (options.type === gradientTypes.radial) {
        gradient = this._window.document.createElementNS("http://www.w3.org/2000/svg", "radialGradient");
        gradient.setAttribute("id", name);
        gradient.setAttribute("gradientUnits", "userSpaceOnUse");
        gradient.setAttribute("fx", String(x + width / 2));
        gradient.setAttribute("fy", String(y + height / 2));
        gradient.setAttribute("cx", String(x + width / 2));
        gradient.setAttribute("cy", String(y + height / 2));
        gradient.setAttribute("r", String(size / 2));
      } else {
        const rotation = ((options.rotation || 0) + additionalRotation) % (2 * Math.PI);
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

        gradient = this._window.document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        gradient.setAttribute("id", name);
        gradient.setAttribute("gradientUnits", "userSpaceOnUse");
        gradient.setAttribute("x1", String(Math.round(x0)));
        gradient.setAttribute("y1", String(Math.round(y0)));
        gradient.setAttribute("x2", String(Math.round(x1)));
        gradient.setAttribute("y2", String(Math.round(y1)));
      }

      options.colorStops.forEach(({ offset, color }: { offset: number; color: string }) => {
        const stop = this._window.document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop.setAttribute("offset", `${100 * offset}%`);
        stop.setAttribute("stop-color", color);
        gradient.appendChild(stop);
      });

      return gradient;
    }

    return null;
  }

  _roundSize = (value: number) => {
    if (this._options.dotsOptions.roundSize) {
      return Math.floor(value);
    }
    return value;
  };

  // from -> to
  getDirections = () => ({
    left: {
      right: this.right.bind(this),
      bottom: null,
      left: this.rightU.bind(this),
      top: this.rightUp.bind(this)
    },
    right: {
      right: this.leftU.bind(this),
      bottom: this.leftDown.bind(this),
      left: this.left.bind(this),
      top: null
    },
    top: {
      right: this.downRight.bind(this),
      bottom: this.down.bind(this),
      left: null,
      top: this.bottomU.bind(this)
    },
    bottom: {
      right: null,
      bottom: this.topU.bind(this),
      left: this.upLeft.bind(this),
      top: this.up.bind(this)
    }
  });

  down(size: number) {
    return `v ${size}`;
  }

  right(size: number) {
    return `h ${size}`;
  }

  up(size: number) {
    return `v -${size}`;
  }

  left(size: number) {
    return `h -${size}`;
  }

  leftDownArc(size: number) {
    return `a ${size} ${size} 0 0 0 -${size} ${size}`;
  }

  upLeftArc(size: number) {
    return `a ${size} ${size} 0 0 0 -${size} -${size}`;
  }

  downRightArc(size: number) {
    return `a ${size} ${size} 0 0 0 ${size} ${size}`;
  }

  rightUpArc(size: number) {
    return `a ${size} ${size} 0 0 0 ${size} -${size}`;
  }

  bottomUArc(size: number) {
    return `a ${size / 2} ${size / 2} 0 0 0 ${size} 0`;
  }

  rightUArc(size: number) {
    return `a ${size / 2} ${size / 2} 0 0 0 0 -${size}`;
  }

  topUArc(size: number) {
    return `a ${size / 2} ${size / 2} 0 0 0 -${size} 0`;
  }

  leftUArc(size: number) {
    return `a ${size / 2} ${size / 2} 0 0 0 0 ${size}`;
  }

  leftDown(size: number, style: DotType) {
    if (style === "rounded" || style === "classy") {
      return this.left(size / 2) + this.leftDownArc(size / 2) + this.down(size / 2);
    } else if (style === "extra-rounded" || style === "classy-rounded") {
      return this.leftDownArc(size);
    }
    return this.left(size) + this.down(size);
  }

  upLeft(size: number, style: DotType) {
    if (style === "rounded") {
      return this.up(size / 2) + this.upLeftArc(size / 2) + this.left(size / 2);
    } else if (style === "extra-rounded") {
      return this.upLeftArc(size);
    }
    return this.up(size) + this.left(size);
  }

  downRight(size: number, style: DotType) {
    if (style === "rounded") {
      return this.down(size / 2) + this.downRightArc(size / 2) + this.right(size / 2);
    } else if (style === "extra-rounded") {
      return this.downRightArc(size);
    }
    return this.down(size) + this.right(size);
  }

  rightUp(size: number, style: DotType) {
    if (style === "rounded" || style === "classy") {
      return this.right(size / 2) + this.rightUpArc(size / 2) + this.up(size / 2);
    } else if (style === "extra-rounded" || style === "classy-rounded") {
      return this.rightUpArc(size);
    }
    return this.right(size) + this.up(size);
  }

  bottomU(size: number, style: DotType) {
    if (style === "rounded" || style === "extra-rounded") {
      return this.down(size / 2) + this.bottomUArc(size) + this.up(size / 2);
    } else if (style === "classy") {
      return this.down(size) + this.right(size / 2) + this.rightUpArc(size / 2) + this.up(size / 2);
    } else if (style === "classy-rounded") {
      return this.down(size) + this.rightUpArc(size);
    }
    return this.down(size) + this.right(size) + this.up(size);
  }

  leftU(size: number, style: DotType) {
    if (style === "rounded" || style === "extra-rounded") {
      return this.left(size / 2) + this.leftUArc(size) + this.right(size / 2);
    } else if (style === "classy") {
      return this.left(size / 2) + this.leftDownArc(size / 2) + this.down(size / 2) + this.right(size);
    } else if (style === "classy-rounded") {
      return this.leftDownArc(size) + this.right(size);
    }
    return this.left(size) + this.down(size) + this.right(size);
  }

  rightU(size: number, style: DotType) {
    if (style === "rounded" || style === "extra-rounded") {
      return this.right(size / 2) + this.rightUArc(size) + this.left(size / 2);
    } else if (style === "classy") {
      return this.right(size / 2) + this.rightUpArc(size / 2) + this.up(size / 2) + this.left(size);
    } else if (style === "classy-rounded") {
      return this.rightUpArc(size) + this.left(size);
    }
    return this.right(size) + this.up(size) + this.left(size);
  }

  topU(size: number, style: DotType) {
    if (style === "rounded" || style === "extra-rounded") {
      return this.up(size / 2) + this.topUArc(size) + this.down(size / 2);
    } else if (style === "classy") {
      return this.up(size) + this.left(size / 2) + this.leftDownArc(size / 2) + this.down(size / 2);
    } else if (style === "classy-rounded") {
      return this.up(size) + this.leftDownArc(size);
    }
    return this.up(size) + this.left(size) + this.down(size);
  }

  singleDot(size: number, style: DotType) {
    if (style === "rounded" || style === "extra-rounded") {
      // Circle
      return `m ${size / 2} 0` + this.leftUArc(size) + this.rightUArc(size);
    } else if (style === "classy" || style === "classy-rounded") {
      return (
        `m ${size / 2} 0` +
        this.leftDownArc(size / 2) +
        this.down(size / 2) +
        this.right(size / 2) +
        this.rightUpArc(size / 2) +
        this.up(size / 2)
      );
    }
    return this.down(size) + this.right(size) + this.up(size) + this.left(size);
  }
}
