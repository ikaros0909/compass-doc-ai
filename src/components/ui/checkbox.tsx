"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  indeterminate?: boolean;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, indeterminate, checked, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);

    React.useImperativeHandle<HTMLInputElement | null, HTMLInputElement | null>(
      forwardedRef,
      () => innerRef.current
    );

    React.useEffect(() => {
      if (innerRef.current) {
        innerRef.current.indeterminate = Boolean(indeterminate);
      }
    }, [indeterminate]);

    return (
      <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <input
          ref={innerRef}
          type="checkbox"
          checked={checked}
          className={cn(
            "peer h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-sm border border-primary shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 checked:bg-primary indeterminate:bg-primary",
            className
          )}
          {...props}
        />
        {(checked || indeterminate) && (
          <Check
            className={cn(
              "pointer-events-none absolute h-3 w-3 text-primary-foreground",
              indeterminate && !checked && "opacity-80"
            )}
          />
        )}
      </span>
    );
  }
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
