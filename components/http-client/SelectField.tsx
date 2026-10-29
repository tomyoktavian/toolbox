import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** Extra classes for this option in the list and, when selected, in the trigger. */
  className?: string;
}

// Base UI reads `null` as "nothing selected", so an empty-string option value travels as this.
const EMPTY = '__empty__';
const toInternal = (value: string): string => (value === '' ? EMPTY : value);
const fromInternal = (value: string): string => (value === EMPTY ? '' : value);

/**
 * The shadcn Select with the plain `<select>` shape this module used to use: a value, a list of
 * options and an onChange. `ghost` drops the border until hover, for dense tables and toolbars.
 */
export function SelectField<T extends string>({
  value,
  onChange,
  options,
  variant = 'outline',
  className,
  tip,
  placeholder,
}: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<SelectOption<T>>;
  variant?: 'outline' | 'ghost';
  className?: string;
  /** Tooltip text, shown by the module's tooltip layer. */
  tip?: string;
  placeholder?: string;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <Select
      value={toInternal(value)}
      onValueChange={(next) => {
        if (next !== null) onChange(fromInternal(next) as T);
      }}
      items={options.map((option) => ({ value: toInternal(option.value), label: option.label }))}
    >
      <SelectTrigger
        size="sm"
        data-tip={tip}
        className={cn(
          'text-xs',
          variant === 'ghost' && 'border-transparent bg-transparent hover:border-input dark:bg-transparent',
          selected?.className,
          className,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="w-auto min-w-(--anchor-width)" alignItemWithTrigger={false} align="start">
        {options.map((option) => (
          <SelectItem key={option.value} value={toInternal(option.value)} className={cn('text-xs', option.className)}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
