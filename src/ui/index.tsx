import {
  Button as AntButton,
  Input as AntInput,
  Select as AntSelect,
  Checkbox as AntCheckbox,
  Collapse,
} from 'antd';
import React from 'react';

export function Button({
  type = 'submit',
  className = '',
  color: _color,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const variant = className.split(' ').includes('primary')
    ? 'primary'
    : className.includes('text-button') || className.includes('icon-btn')
      ? 'text'
      : 'default';
  return (
    <AntButton
      {...props}
      htmlType={type}
      type={variant}
      danger={className.split(' ').includes('danger')}
      className={className}
    />
  );
}
export function Input({ type, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const inputProps = props as React.ComponentProps<typeof AntInput>;
  return type === 'password' ? (
    <AntInput.Password {...inputProps} />
  ) : (
    <AntInput {...inputProps} type={type} />
  );
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <AntInput.TextArea {...(props as React.ComponentProps<typeof AntInput.TextArea>)} />;
}
export function Checkbox({
  onChange,
  children,
  type: _type,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <AntCheckbox
      {...(props as React.ComponentProps<typeof AntCheckbox>)}
      onChange={(event) => onChange?.(event as unknown as React.ChangeEvent<HTMLInputElement>)}
    >
      {children}
    </AntCheckbox>
  );
}
export function Select({
  children,
  onChange,
  value,
  defaultValue,
  id,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const options = React.Children.toArray(children)
    .filter(React.isValidElement)
    .map((child) => {
      const option = (
        child as React.ReactElement<{
          value: string;
          children: React.ReactNode;
          disabled?: boolean;
        }>
      ).props;
      return { value: option.value, label: option.children, disabled: option.disabled };
    });
  return (
    <AntSelect
      {...(props as React.ComponentProps<typeof AntSelect>)}
      id={id}
      value={value as string}
      defaultValue={defaultValue as string}
      options={options}
      onChange={(value) =>
        onChange?.({
          target: { value },
          currentTarget: { value },
        } as React.ChangeEvent<HTMLSelectElement>)
      }
      getPopupContainer={(trigger) => trigger.parentElement || document.body}
    />
  );
}
export function Disclosure({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const nodes = React.Children.toArray(children);
  const heading = nodes.find((node) => React.isValidElement(node) && node.type === 'summary') as
    | React.ReactElement<{ children: React.ReactNode }>
    | undefined;
  return (
    <Collapse
      ghost
      className={className}
      items={[
        {
          key: 'details',
          label: heading?.props.children,
          children: nodes.filter((node) => node !== heading),
        },
      ]}
    />
  );
}
