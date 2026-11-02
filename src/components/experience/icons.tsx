// 출처 상태 · 수행 주체 아이콘 — 시안(ETC#7)의 SVG 를 그대로 옮겼다. 나머지 아이콘은 lucide-react
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[1em] shrink-0"
      {...props}
    >
      {children}
    </svg>
  );
}

/** 원문에서 확인 — 말풍선 + 체크 */
export function QuoteCheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="m9 10.5 2 2 4-4" />
    </Icon>
  );
}

/** 내가 입력 — 연필 */
export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </Icon>
  );
}

/** 확인 필요 — 물음표 */
export function HelpIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" />
      <path d="M12 17.2v.1" />
    </Icon>
  );
}

export function MeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </Icon>
  );
}

export function TeamIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5" />
      <path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4" />
      <path d="M18 14.8c1.7.8 2.9 2.6 3.5 5.2" />
    </Icon>
  );
}

/** 알 수 없음 — 점선 사람 */
export function UnknownActorIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8" r="4" strokeDasharray="3 2.5" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" strokeDasharray="3 2.5" />
    </Icon>
  );
}
