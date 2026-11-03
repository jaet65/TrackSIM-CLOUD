import { useEffect, useRef } from 'react';

interface EscapeHandler {
  id: symbol;
  close: () => void;
}

const activeModals: EscapeHandler[] = [];
let previousDocumentOverflow = '';
let previousBodyOverflow = '';
let previousBodyOverscrollBehavior = '';

const lockPageScroll = () => {
  previousDocumentOverflow = document.documentElement.style.overflow;
  previousBodyOverflow = document.body.style.overflow;
  previousBodyOverscrollBehavior = document.body.style.overscrollBehavior;
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  document.body.style.overscrollBehavior = 'none';
};

const unlockPageScroll = () => {
  document.documentElement.style.overflow = previousDocumentOverflow;
  document.body.style.overflow = previousBodyOverflow;
  document.body.style.overscrollBehavior = previousBodyOverscrollBehavior;
}

const handleEscape = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return;

  const topModal = activeModals[activeModals.length - 1];
  if (!topModal) return;

  event.preventDefault();
  event.stopPropagation();
  topModal.close();
};

export const useEscapeKey = (isOpen: boolean, onClose: () => void) => {
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const modal: EscapeHandler = {
      id: Symbol('modal'),
      close: () => closeRef.current()
    };
    activeModals.push(modal);

    if (activeModals.length === 1) {
      lockPageScroll();
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      const modalIndex = activeModals.findIndex((activeModal) => activeModal.id === modal.id);
      if (modalIndex !== -1) activeModals.splice(modalIndex, 1);
      if (activeModals.length === 0) {
        document.removeEventListener('keydown', handleEscape);
        unlockPageScroll();
      }
    };
  }, [isOpen]);
};
