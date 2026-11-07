import { createCn } from "cn/config";

// globals.css 의 --text-* 와 맞춘다. 여기 없으면 cn 이 글자색으로 보고 text-muted 같은 색과 합쳐 지운다(FE#182)
const FONT_SIZES = ["note", "ui", "title-md", "icon", "title-lg", "heading", "display", "hero-sm", "hero"];

export const cn = createCn({ extend: { classGroups: { "font-size": [{ text: FONT_SIZES }] } } });
