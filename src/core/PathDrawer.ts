import {
  bottomUArc,
  down,
  downRightArc,
  left,
  leftDownArc,
  leftUArc,
  right,
  rightUArc,
  rightUpArc,
  topUArc,
  up,
  upLeftArc
} from "../tools/path.utils";

export class PathDrawer {
  size: number;

  constructor(size: number) {
    this.size = size;
  }

  right() {
    return right(this.size);
  }

  rightUp() {
    return right(this.size) + up(this.size);
  }

  rightU() {
    return this.rightUp() + left(this.size);
  }

  left() {
    return left(this.size);
  }

  leftDown() {
    return left(this.size) + down(this.size);
  }

  leftU() {
    return this.leftDown() + right(this.size);
  }

  down() {
    return down(this.size);
  }

  downRight() {
    return down(this.size) + right(this.size);
  }

  downU() {
    return down(this.size) + this.rightUp();
  }

  up() {
    return up(this.size);
  }

  upLeft() {
    return up(this.size) + left(this.size);
  }

  upU() {
    return up(this.size) + this.leftDown();
  }

  singleDot() {
    return `m ${this.size} 0` + this.leftDown() + this.rightUp();
  }
}

export class ClassyPathDrawer extends PathDrawer {
  constructor(size: number) {
    super(size);
  }

  rightUp() {
    return right(this.size / 2) + rightUpArc(this.size / 2) + up(this.size / 2);
  }

  leftDown() {
    return left(this.size / 2) + leftDownArc(this.size / 2) + down(this.size / 2);
  }
}

export class ClassyRoundedPathDrawer extends PathDrawer {
  constructor(size: number) {
    super(size);
  }

  rightUp() {
    return rightUpArc(this.size);
  }

  leftDown() {
    return leftDownArc(this.size);
  }

  singleDot() {
    return (
      `m ${this.size} 0` +
      left(this.size / 2) +
      leftDownArc(this.size / 2) +
      down(this.size / 2) +
      right(this.size / 2) +
      rightUpArc(this.size / 2) +
      up(this.size / 2)
    );
  }
}

export class RoundedPathDrawer extends ClassyPathDrawer {
  constructor(size: number) {
    super(size);
  }

  downRight(): string {
    return down(this.size / 2) + downRightArc(this.size / 2) + right(this.size / 2);
  }

  upLeft() {
    return up(this.size / 2) + upLeftArc(this.size / 2) + left(this.size / 2);
  }

  downU() {
    return down(this.size / 2) + bottomUArc(this.size) + up(this.size / 2);
  }

  leftU() {
    return left(this.size / 2) + leftUArc(this.size) + right(this.size / 2);
  }

  rightU() {
    return right(this.size / 2) + rightUArc(this.size) + left(this.size / 2);
  }

  upU() {
    return up(this.size / 2) + topUArc(this.size) + down(this.size / 2);
  }

  singleDot() {
    return `m ${this.size / 2} 0` + leftUArc(this.size) + rightUArc(this.size);
  }
}

export class ExtraRoundedPathDrawer extends RoundedPathDrawer {
  constructor(size: number) {
    super(size);
  }

  rightUp() {
    return rightUpArc(this.size);
  }

  leftDown() {
    return leftDownArc(this.size);
  }

  downRight() {
    return downRightArc(this.size);
  }

  upLeft() {
    return upLeftArc(this.size);
  }
}

export function drawerFactory(
  style: "classy" | "classy-rounded" | "rounded" | "extra-rounded" | "square",
  size: number
) {
  switch (style) {
    case "classy":
      return new ClassyPathDrawer(size);
    case "classy-rounded":
      return new ClassyRoundedPathDrawer(size);
    case "rounded":
      return new RoundedPathDrawer(size);
    case "extra-rounded":
      return new ExtraRoundedPathDrawer(size);
    case "square":
      return new PathDrawer(size);
  }
}

export function getDrawDirections(drawer: PathDrawer) {
  return {
    left: {
      right: drawer.right.bind(drawer),
      bottom: null,
      left: drawer.rightU.bind(drawer),
      top: drawer.rightUp.bind(drawer)
    },
    right: {
      right: drawer.leftU.bind(drawer),
      bottom: drawer.leftDown.bind(drawer),
      left: drawer.left.bind(drawer),
      top: null
    },
    top: {
      right: drawer.downRight.bind(drawer),
      bottom: drawer.down.bind(drawer),
      left: null,
      top: drawer.downU.bind(drawer)
    },
    bottom: {
      right: null,
      bottom: drawer.upU.bind(drawer),
      left: drawer.upLeft.bind(drawer),
      top: drawer.up.bind(drawer)
    }
  };
}
