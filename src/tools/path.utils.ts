import { Window } from "../types";

export function down(size: number) {
  return `v ${size}`;
}

export function right(size: number) {
  return `h ${size}`;
}

export function up(size: number) {
  return `v -${size}`;
}

export function left(size: number) {
  return `h -${size}`;
}

export function leftDownArc(size: number) {
  return `a ${size} ${size} 0 0 0 -${size} ${size}`;
}

export function upLeftArc(size: number) {
  return `a ${size} ${size} 0 0 0 -${size} -${size}`;
}

export function downRightArc(size: number) {
  return `a ${size} ${size} 0 0 0 ${size} ${size}`;
}

export function rightUpArc(size: number) {
  return `a ${size} ${size} 0 0 0 ${size} -${size}`;
}

export function bottomUArc(size: number) {
  return `a ${size / 2} ${size / 2} 0 0 0 ${size} 0`;
}

export function rightUArc(size: number) {
  return `a ${size / 2} ${size / 2} 0 0 0 0 -${size}`;
}

export function topUArc(size: number) {
  return `a ${size / 2} ${size / 2} 0 0 0 -${size} 0`;
}

export function leftUArc(size: number) {
  return `a ${size / 2} ${size / 2} 0 0 0 0 ${size}`;
}

export function createDonutElement(window: Window, offset: { dx: number; dy: number }, size: number, dotSize: number) {
  const element = window.document.createElementNS("http://www.w3.org/2000/svg", "path");
  element.setAttribute("clip-rule", "evenodd");
  element.setAttribute(
    "d",
    `M ${offset.dx + size / 2} ${offset.dy}` + // M cx, y //  Move to top of ring
      `a ${size / 2} ${size / 2} 0 1 0 0.1 0` + // a outerRadius, outerRadius, 0, 1, 0, 1, 0 // Draw outer arc, but don't close it
      `z` + // Z // Close the outer shape
      `m 0 ${dotSize}` + // m -1 outerRadius-innerRadius // Move to top point of inner radius
      `a ${size / 2 - dotSize} ${size / 2 - dotSize} 0 1 1 -0.1 0` + // a innerRadius, innerRadius, 0, 1, 1, -1, 0 // Draw inner arc, but don't close it
      `Z` // Z // Close the inner ring. Actually will still work without, but inner ring will have one unit missing in stroke
  );
  return element;
}

export function createCircleElement(window: Window, offset: { dx: number; dy: number }, size: number) {
  const element = window.document.createElementNS("http://www.w3.org/2000/svg", "circle");
  element.setAttribute("cx", String(offset.dx + size / 2));
  element.setAttribute("cy", String(offset.dy + size / 2));
  element.setAttribute("r", String(size / 2));
  return element;
}
