import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

// shadcn button — 시안 6(FE#43, 임시): 알약 모양 · 주(검정) · 보조(옅은 테두리) · 글자
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-semibold leading-none whitespace-nowrap transition-colors outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.15em]",
  {
    variants: {
      variant: {
        // 비활성도 불투명하게 — 떠 있는 버튼 뒤 글자가 비치지 않게
        default:
          "bg-primary text-on-primary hover:bg-primary-active active:bg-primary-active disabled:bg-[color-mix(in_srgb,var(--primary)_45%,var(--canvas))] disabled:opacity-100",
        secondary: "bg-canvas text-ink shadow-[inset_0_0_0_1px_var(--hairline)] hover:bg-surface-soft",
        ghost: "text-body hover:bg-surface-strong",
        link: "px-0.5 font-medium text-ink underline-offset-3 hover:underline",
      },
      size: {
        default: "h-10 px-4.5 text-sm",
        sm: "h-9 px-3.5 text-note",
        icon: "size-9 rounded-full text-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
