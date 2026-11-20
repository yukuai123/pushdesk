import { Alert, Modal as AntModal } from 'antd';
import React from 'react';
export const ErrorContext = React.createContext('');
export function Modal({
  title,
  children,
  close,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const error = React.useContext(ErrorContext);
  const content = (
    <>
      {error && <Alert type="error" showIcon message={error} className="modal-error" />}
      {children}
    </>
  );
  // Keep static rendering available for component regression tests.
  if (typeof document === 'undefined')
    return (
      <section role="dialog" aria-label={title}>
        {content}
      </section>
    );
  return (
    <AntModal
      open
      title={title}
      onCancel={close}
      footer={null}
      width={wide ? 920 : 620}
      className="push-modal"
      styles={{ body: { padding: 0 } }}
      maskClosable={false}
    >
      {content}
    </AntModal>
  );
}
