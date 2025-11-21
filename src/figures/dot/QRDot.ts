import dotTypes from "../../constants/dotTypes";
import {
  BasicFigureDrawArgs,
  DotType,
  DrawArgs,
  GetNeighbor,
  Orientation,
  OrientedFigureDrawArgs,
  RoundedCorners,
  SideOrientation,
  SideOrientedFigureDrawArgs,
  Window
} from "../../types";

export default class QRDot {
  _element?: SVGElement;
  _svg: SVGElement;
  _type: DotType;
  _window: Window;

  constructor({ svg, type, window }: { svg: SVGElement; type: DotType; window: Window }) {
    this._svg = svg;
    this._type = type;
    this._window = window;
  }

  draw(x: number, y: number, size: number, getNeighbor: GetNeighbor): void {
    const type = this._type;
    let drawFunction;

    switch (type) {
      case dotTypes.dots:
        drawFunction = this._drawDot;
        break;
      case dotTypes.classy:
        drawFunction = this._drawClassy;
        break;
      case dotTypes.classyRounded:
        drawFunction = this._drawClassyRounded;
        break;
      case dotTypes.rounded:
        drawFunction = this._drawRounded;
        break;
      case dotTypes.extraRounded:
        drawFunction = this._drawExtraRounded;
        break;
      case dotTypes.square:
      default:
        drawFunction = this._drawSquare;
    }

    drawFunction.call(this, { x, y, size, getNeighbor });
  }

  _basicDot(args: BasicFigureDrawArgs): void {
    const { size, x, y } = args;

    this._element = this._window.document.createElementNS("http://www.w3.org/2000/svg", "circle");
    this._element.setAttribute("cx", String(x + size / 2));
    this._element.setAttribute("cy", String(y + size / 2));
    this._element.setAttribute("r", String(size / 2));
  }

  _basicSquare(args: BasicFigureDrawArgs): void {
    const { size, x, y } = args;

    this._element = this._window.document.createElementNS("http://www.w3.org/2000/svg", "rect");
    this._element.setAttribute("x", String(x));
    this._element.setAttribute("y", String(y));
    this._element.setAttribute("width", String(size));
    this._element.setAttribute("height", String(size));
  }

  //if rotation === 0 - right side is rounded
  _basicSideRounded(args: SideOrientedFigureDrawArgs): void {
    const { size, x, y, orientation } = args;

    const path = (() => {
      switch (orientation) {
        case "top":
          return (
            `M ${x} ${y + size}` + // move to left bottom corner
            `h ${size}` + // draw line to right bottom corner
            `v ${-size / 2}` + // draw line to right center
            `a ${size / 2} ${size / 2}, 0, 0, 0, ${-size} 0` // draw rounded corner
          );
        case "right":
          return (
            `M ${x} ${y}` + // move to left top corner
            `v ${size}` + // draw line to left bottom corner
            `h ${size / 2}` + // draw line to bottom center
            `a ${size / 2} ${size / 2}, 0, 0, 0, 0 ${-size}` // draw rounded corner
          );
        case "bottom":
          return (
            `M ${x + size} ${y}` + // move to right top corner
            `h ${-size}` + // draw line to left top corner
            `v ${size / 2}` + // draw line to left center
            `a ${size / 2} ${size / 2}, 0, 0, 0, ${size} 0` // draw rounded corner
          );
        case "left":
        default:
          return (
            `M ${x + size} ${y + size}` + // move to right bottom corner
            `v ${-size}` + // draw line to right top corner
            `h ${-size / 2}` + // draw line to top center
            `a ${size / 2} ${size / 2}, 0, 0, 0, 0 ${size}` // draw rounded corner
          );
      }
    })();

    this._element = this._window.document.createElementNS("http://www.w3.org/2000/svg", "path");
    this._element.setAttribute("d", path);
  }

  //if rotation === 0 - top right corner is rounded
  _basicCornerRounded(args: OrientedFigureDrawArgs): void {
    const { size, x, y, orientation } = args;

    this._element = this._window.document.createElementNS("http://www.w3.org/2000/svg", "path");
    this._element.setAttribute(
      "d",
      `M ${x} ${y + size / 2}` + // go to the left center
        (orientation === "bottomleft" // move to the bottom center either with a rounded corner or not
          ? `a ${size / 2} ${size / 2}, 0, 0, 0, ${size / 2} ${size / 2}`
          : `v ${size / 2} h ${size / 2}`) +
        (orientation === "bottomright" // move to the right center either with a rounded corner or not
          ? `a ${size / 2} ${size / 2}, 0, 0, 0, ${size / 2} ${-size / 2}`
          : `h ${size / 2} v ${-size / 2}`) +
        (orientation === "topright" // move to the top center either with a rounded corner or not
          ? `a ${size / 2} ${size / 2}, 0, 0, 0, ${-size / 2} ${-size / 2}`
          : `v ${-size / 2} h ${-size / 2}`) +
        (orientation === "topleft" // move to the left center either with a rounded corner or not
          ? `a ${size / 2} ${size / 2}, 0, 0, 0, ${-size / 2} ${size / 2}`
          : `h ${-size / 2} v ${size / 2}`)
    );
  }

  //if rotation === 0 - top right corner is rounded
  _basicCornerExtraRounded(args: OrientedFigureDrawArgs): void {
    const { size, x, y, orientation } = args;

    const path = (() => {
      switch (orientation) {
        case "topleft":
          return (
            `M ${x + size} ${y}` + // move to top right corner
            `a ${size} ${size}, 0, 0, 0, ${-size} ${size}` + // draw rounded top left corner
            `h ${size}` // draw line to right bottom corner
          );
        case "bottomleft":
          return (
            `M ${x} ${y}` + // move to left top corner
            `a ${size} ${size}, 0, 0, 0, ${size} ${size}` + // draw rounded bottom left corner
            `v ${-size}` // draw line to right top corner
          );
        case "bottomright":
          return (
            `M ${x} ${y + size}` + // move to left bottom corner
            `a ${size} ${size}, 0, 0, 0, ${size} ${-size}` + // draw rounded bottom right corner
            `h ${-size}` // draw line to left top corner
          );
        case "topright":
        default:
          return (
            `M ${x + size} ${y + size}` + // move to right bottom corner
            `a ${size} ${size}, 0, 0, 0, ${-size} ${-size}` + // draw rounded top right corner
            `v ${size}` // draw line to left bottom corner
          );
      }
    })();

    this._element = this._window.document.createElementNS("http://www.w3.org/2000/svg", "path");
    this._element.setAttribute("d", path);
  }

  //if rotation === 0 - left bottom and right top corners are rounded
  _basicCornersRounded(args: { x: number; y: number; size: number; corners: RoundedCorners }): void {
    const { size, x, y, corners } = args;

    const path = (() => {
      switch (corners) {
        case "topleftbottomright":
          return (
            `M ${x + size / 2} ${y}` + // go to top center
            `a ${size / 2} ${size / 2}, 0, 0, 0, ${-size / 2} ${size / 2}` + // draw rounded left top corner
            `v ${size / 2}` + // draw line to bottom left corner
            `h ${size / 2}` +
            `a ${size / 2} ${size / 2}, 0, 0, 0, ${size / 2} ${-size / 2}` + // draw rounded right bottom corner
            `v ${-size / 2}` // draw line to right bottom corner
          );
        case "toprightbottomleft":
        default:
          return (
            `M ${x} ${y + size / 2}` + // go to left center
            `a ${size / 2} ${size / 2}, 0, 0, 0, ${size / 2} ${size / 2}` + // draw rounded bottom left corner
            `h ${size / 2}` + // draw line to bottom right corner
            `v ${-size / 2}` + // draw line to bottom center
            `a ${size / 2} ${size / 2}, 0, 0, 0, ${-size / 2} ${-size / 2}` + // draw rounded top right corner
            `h ${-size / 2}` // draw line to left top corner
          );
      }
    })();

    this._element = this._window.document.createElementNS("http://www.w3.org/2000/svg", "path");
    this._element.setAttribute("d", path);
  }

  _drawDot({ x, y, size }: DrawArgs): void {
    this._basicDot({ x, y, size, rotation: 0 });
  }

  _drawSquare({ x, y, size }: DrawArgs): void {
    this._basicSquare({ x, y, size, rotation: 0 });
  }

  _drawRounded({ x, y, size, getNeighbor }: DrawArgs): void {
    const leftNeighbor = getNeighbor ? +getNeighbor(-1, 0) : 0;
    const rightNeighbor = getNeighbor ? +getNeighbor(1, 0) : 0;
    const topNeighbor = getNeighbor ? +getNeighbor(0, -1) : 0;
    const bottomNeighbor = getNeighbor ? +getNeighbor(0, 1) : 0;

    const neighborsCount = leftNeighbor + rightNeighbor + topNeighbor + bottomNeighbor;

    if (neighborsCount === 0) {
      this._basicDot({ x, y, size, rotation: 0 });
      return;
    }

    if (neighborsCount > 2 || (leftNeighbor && rightNeighbor) || (topNeighbor && bottomNeighbor)) {
      this._basicSquare({ x, y, size, rotation: 0 });
      return;
    }

    if (neighborsCount === 2) {
      let orientation: Orientation = "topright";

      if (leftNeighbor && topNeighbor) {
        orientation = "bottomright";
      } else if (topNeighbor && rightNeighbor) {
        orientation = "bottomleft";
      } else if (rightNeighbor && bottomNeighbor) {
        orientation = "topleft";
      }

      this._basicCornerRounded({ x, y, size, orientation });
      return;
    }

    if (neighborsCount === 1) {
      let orientation: SideOrientation = "right";

      if (topNeighbor) {
        orientation = "bottom";
      } else if (rightNeighbor) {
        orientation = "left";
      } else if (bottomNeighbor) {
        orientation = "top";
      }

      this._basicSideRounded({ x, y, size, orientation });
      return;
    }
  }

  _drawExtraRounded({ x, y, size, getNeighbor }: DrawArgs): void {
    const leftNeighbor = getNeighbor ? +getNeighbor(-1, 0) : 0;
    const rightNeighbor = getNeighbor ? +getNeighbor(1, 0) : 0;
    const topNeighbor = getNeighbor ? +getNeighbor(0, -1) : 0;
    const bottomNeighbor = getNeighbor ? +getNeighbor(0, 1) : 0;

    const neighborsCount = leftNeighbor + rightNeighbor + topNeighbor + bottomNeighbor;

    if (neighborsCount === 0) {
      this._basicDot({ x, y, size, rotation: 0 });
      return;
    }

    if (neighborsCount > 2 || (leftNeighbor && rightNeighbor) || (topNeighbor && bottomNeighbor)) {
      this._basicSquare({ x, y, size, rotation: 0 });
      return;
    }

    if (neighborsCount === 2) {
      let orientation: Orientation = "topright";

      if (leftNeighbor && topNeighbor) {
        orientation = "bottomright";
      } else if (topNeighbor && rightNeighbor) {
        orientation = "bottomleft";
      } else if (rightNeighbor && bottomNeighbor) {
        orientation = "topleft";
      }

      this._basicCornerExtraRounded({ x, y, size, orientation });
      return;
    }

    if (neighborsCount === 1) {
      let orientation: SideOrientation = "right";

      if (topNeighbor) {
        orientation = "bottom";
      } else if (rightNeighbor) {
        orientation = "left";
      } else if (bottomNeighbor) {
        orientation = "top";
      }

      this._basicSideRounded({ x, y, size, orientation });
      return;
    }
  }

  _drawClassy({ x, y, size, getNeighbor }: DrawArgs): void {
    const leftNeighbor = getNeighbor ? +getNeighbor(-1, 0) : 0;
    const rightNeighbor = getNeighbor ? +getNeighbor(1, 0) : 0;
    const topNeighbor = getNeighbor ? +getNeighbor(0, -1) : 0;
    const bottomNeighbor = getNeighbor ? +getNeighbor(0, 1) : 0;

    const neighborsCount = leftNeighbor + rightNeighbor + topNeighbor + bottomNeighbor;

    if (neighborsCount === 0) {
      this._basicCornersRounded({ x, y, size, corners: "topleftbottomright" });
      return;
    }

    if (!leftNeighbor && !topNeighbor) {
      this._basicCornerRounded({ x, y, size, orientation: "topleft" });
      return;
    }

    if (!rightNeighbor && !bottomNeighbor) {
      this._basicCornerRounded({ x, y, size, orientation: "bottomright" });
      return;
    }

    this._basicSquare({ x, y, size, rotation: 0 });
  }

  _drawClassyRounded({ x, y, size, getNeighbor }: DrawArgs): void {
    const leftNeighbor = getNeighbor ? +getNeighbor(-1, 0) : 0;
    const rightNeighbor = getNeighbor ? +getNeighbor(1, 0) : 0;
    const topNeighbor = getNeighbor ? +getNeighbor(0, -1) : 0;
    const bottomNeighbor = getNeighbor ? +getNeighbor(0, 1) : 0;

    const neighborsCount = leftNeighbor + rightNeighbor + topNeighbor + bottomNeighbor;

    if (neighborsCount === 0) {
      this._basicCornersRounded({ x, y, size, corners: "topleftbottomright" });
      return;
    }

    if (!leftNeighbor && !topNeighbor) {
      this._basicCornerExtraRounded({ x, y, size, orientation: "topleft" });
      return;
    }

    if (!rightNeighbor && !bottomNeighbor) {
      this._basicCornerExtraRounded({ x, y, size, orientation: "bottomright" });
      return;
    }

    this._basicSquare({ x, y, size, rotation: 0 });
  }
}
