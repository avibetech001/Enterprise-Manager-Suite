---
name: shadcn form.tsx pitfall
description: FormItem/FormLabel crash when used outside a FormField render prop
---

Rule: a bare `FormItem`/`FormLabel` outside a `FormField` render prop crashes the page with "useFormField should be used within <FormField>".

**Why:** the shadcn form components read react-hook-form context that only exists inside `FormField`.

**How to apply:** for read-only rows or non-form labels, use a plain `div` + `p`/`Label` instead.
