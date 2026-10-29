import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { CodeEditor } from '@/components/http-client/shared/CodeEditor';
import { useVarHover, useVarScope } from './VarInput';
import { varExtensions, type VarHoverHandlers } from './var-codemirror';

const NO_EXTENSIONS: NonNullable<ComponentProps<typeof CodeEditor>['extensions']> = [];

/** CodeEditor with the same `{{variable}}` colouring, hover card and suggestions as VarInput. */
export function VarCodeEditor({ extensions = NO_EXTENSIONS, ...props }: ComponentProps<typeof CodeEditor>) {
  const current = useVarScope();
  const environment = current?.environment;
  const collection = current?.collection;
  const globals = current?.globals;
  // Panels rebuild the scope object on every render; key it on its parts so typing does not
  // reconfigure the editor (which would also close the suggestion list).
  const scope = useMemo(
    () =>
      globals
        ? { ...(environment ? { environment } : {}), ...(collection ? { collection } : {}), globals }
        : undefined,
    [environment, collection, globals],
  );
  const { show, scheduleClose, card } = useVarHover(scope);
  // Moving across plain text fires mousemove continuously; schedule the close only once per exit.
  const leaving = useRef(false);
  const handlers = useRef<VarHoverHandlers>({ onHover: () => {}, onLeave: () => {} });

  useEffect(() => {
    handlers.current = {
      onHover: (name, rect) => {
        leaving.current = false;
        show(name, rect);
      },
      onLeave: () => {
        if (leaving.current) return;
        leaving.current = true;
        scheduleClose();
      },
    };
  }, [show, scheduleClose]);

  // A stable forwarder, so the editor extensions are rebuilt only when the scope changes.
  const [forward] = useState<VarHoverHandlers>(() => ({
    onHover: (name, rect) => handlers.current.onHover(name, rect),
    onLeave: () => handlers.current.onLeave(),
  }));

  const merged = useMemo(() => [...extensions, ...varExtensions(scope, forward)], [extensions, scope, forward]);

  return (
    <>
      <CodeEditor {...props} extensions={merged} />
      {card}
    </>
  );
}
