import * as React from "react";

import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type = "text", ...props }, ref) => {
  return (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-11 w-full rounded-none border border-[#d8d2c7] bg-[#fbf8f2] px-3 py-2 text-sm text-[#111111] outline-none transition placeholder:text-[#8f887c] focus:border-[#1B5E20] focus:ring-2 focus:ring-[#1B5E20]/10 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

Input.displayName = "Input";

export { Input };
