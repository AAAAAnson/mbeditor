import type { TextareaHTMLAttributes } from "react";

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`mb-textarea ${className}`.trim()} {...props} />;
}

export default Textarea;
