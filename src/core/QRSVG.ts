import { Image } from "canvas";
import errorCorrectionPercents from "../constants/errorCorrectionPercents";
import gradientTypes from "../constants/gradientTypes";
import shapeTypes from "../constants/shapeTypes";
import QRCornerDot, { availableCornerDotTypes } from "../figures/cornerDot/QRCornerDot";
import QRCornerSquare, { availableCornerSquareTypes } from "../figures/cornerSquare/QRCornerSquare";
import QRDot from "../figures/dot/QRDot";
import calculateImageSize from "../tools/calculateImageSize";
import toDataUrl from "../tools/toDataUrl";
import { DotType, FilterFunction, Gradient, QRCode, Window } from "../types";
import { RequiredOptions } from "./QROptions";

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

export default class QRSVG {
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

  //TODO don't pass all options to this class
  constructor(options: RequiredOptions, window: Window, qr: QRCode, dotSize: number = 4) {
    this._window = window;
    this._options = options;
    this._qr = qr;
    this._instanceId = QRSVG.instanceCount++;
    this._dotSize = dotSize;
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

    this.drawBackground({ backgroundOptions: this._options.backgroundOptions });
    this.drawDots((row: number, col: number): boolean => {
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

  drawDots(filter?: FilterFunction): void {
    const options = this._options;
    const count = this.moduleCount();
    const { width, height } = this.viewboxSize();

    const xBeginning = this._roundSize((width - count * this._dotSize) / 2);
    const yBeginning = this._roundSize((height - count * this._dotSize) / 2);
    const dot = new QRDot({
      svg: this._element,
      type: options.dotsOptions.type,
      window: this._window
    });

    const gradientElement = this._newCreateColor({
      options: options.dotsOptions?.gradient,
      additionalRotation: 0,
      x: 0,
      y: 0,
      height: options.height,
      width: options.width,
      name: `dot-color-${this._instanceId}`
    });

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (filter && !filter(row, col)) {
          continue;
        }
        if (!this._qr?.isDark(row, col)) {
          continue;
        }

        dot.draw(
          xBeginning + col * this._dotSize,
          yBeginning + row * this._dotSize,
          this._dotSize,
          (xOffset: number, yOffset: number): boolean => {
            if (col + xOffset < 0 || row + yOffset < 0 || col + xOffset >= count || row + yOffset >= count)
              return false;
            if (filter && !filter(row + yOffset, col + xOffset)) return false;
            return !!this._qr && this._qr.isDark(row + yOffset, col + xOffset);
          }
        );

        if (dot._element) {
          if (gradientElement) {
            dot._element.setAttribute("fill", `url('#background-color-${this._instanceId}')`);
            this._defs.appendChild(gradientElement);
          } else {
            dot._element.setAttribute("fill", options.dotsOptions.color || "#fff");
          }
          this._element.appendChild(dot._element);
        }
      }
    }

    if (options.shape === shapeTypes.circle) {
      const additionalDots = this._roundSize(
        ((Math.min(width, height) - this._options.margin * 2) / this._dotSize - count) / 2
      );
      const fakeCount = count + additionalDots * 2;
      const xFakeBeginning = xBeginning - additionalDots * this._dotSize;
      const yFakeBeginning = yBeginning - additionalDots * this._dotSize;
      const fakeMatrix: number[][] = [];
      const center = this._roundSize(fakeCount / 2);

      for (let row = 0; row < fakeCount; row++) {
        fakeMatrix[row] = [];
        for (let col = 0; col < fakeCount; col++) {
          if (
            row >= additionalDots - 1 &&
            row <= fakeCount - additionalDots &&
            col >= additionalDots - 1 &&
            col <= fakeCount - additionalDots
          ) {
            fakeMatrix[row][col] = 0;
            continue;
          }

          if (Math.sqrt((row - center) * (row - center) + (col - center) * (col - center)) > center) {
            fakeMatrix[row][col] = 0;
            continue;
          }

          //Get random dots from QR code to show it outside of QR code
          fakeMatrix[row][col] = this._qr.isDark(
            col - 2 * additionalDots < 0 ? col : col >= count ? col - 2 * additionalDots : col - additionalDots,
            row - 2 * additionalDots < 0 ? row : row >= count ? row - 2 * additionalDots : row - additionalDots
          )
            ? 1
            : 0;
        }
      }

      for (let row = 0; row < fakeCount; row++) {
        for (let col = 0; col < fakeCount; col++) {
          if (!fakeMatrix[row][col]) continue;

          dot.draw(
            xFakeBeginning + col * this._dotSize,
            yFakeBeginning + row * this._dotSize,
            this._dotSize,
            (xOffset: number, yOffset: number): boolean => {
              return !!fakeMatrix[row + yOffset]?.[col + xOffset];
            }
          );

          if (dot._element) {
            if (gradientElement) {
              dot._element.setAttribute("fill", `url('#background-color-${this._instanceId}')`);
            } else {
              dot._element.setAttribute("fill", options.dotsOptions.color || "#000");
            }
            this._element.appendChild(dot._element);
          }
        }
      }
    }
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

  _createColor({
    options,
    color,
    additionalRotation,
    x,
    y,
    height,
    width,
    name
  }: {
    options?: Gradient;
    color?: string;
    additionalRotation: number;
    x: number;
    y: number;
    height: number;
    width: number;
    name: string;
  }): void {
    const size = width > height ? width : height;
    const rect = this._window.document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("height", String(height));
    rect.setAttribute("width", String(width));
    rect.setAttribute("clip-path", `url('#clip-path-${name}')`);

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

      rect.setAttribute("fill", `url('#${name}')`);
      this._defs.appendChild(gradient);
    } else if (color) {
      rect.setAttribute("fill", color);
    }

    this._element.appendChild(rect);
  }

  _roundSize = (value: number) => {
    if (this._options.dotsOptions.roundSize) {
      return Math.floor(value);
    }
    return value;
  };
}
