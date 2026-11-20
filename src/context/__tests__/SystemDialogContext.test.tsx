// @vitest-environment jsdom
import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SystemDialogProvider, useSystemDialogs } from '../SystemDialogContext';

const DialogHarness: React.FC = () => {
  const { showAlert, showConfirm, showPrompt } = useSystemDialogs();
  const [result, setResult] = useState('');

  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          const alert = showAlert('Primer aviso');
          const confirmation = showConfirm('¿Continuar?', { confirmLabel: 'Continuar' });
          await alert;
          setResult(String(await confirmation));
        }}
      >
        Mostrar cola
      </button>
      <button
        type="button"
        onClick={async () => {
          const value = await showPrompt('Escribe ELIMINAR', {
            inputLabel: 'Confirmación',
            placeholder: 'ELIMINAR',
            confirmLabel: 'Validar'
          });
          setResult(value || 'cancelado');
        }}
      >
        Mostrar entrada
      </button>
      <output>{result}</output>
    </div>
  );
};

const renderDialogHarness = () => render(
  <SystemDialogProvider>
    <DialogHarness />
  </SystemDialogProvider>
);

describe('SystemDialogProvider', () => {
  it('queues styled dialogs and resolves confirmations', async () => {
    renderDialogHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar cola' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Primer aviso');
    expect(screen.queryByText('¿Continuar?')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(await screen.findByText('¿Continuar?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() => expect(screen.getByText('true')).toBeInTheDocument());
  });

  it('returns prompt input and treats cancel as a null result', async () => {
    renderDialogHarness();

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar entrada' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Confirmación' }), { target: { value: 'eliminar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar' }));
    await waitFor(() => expect(screen.getByText('eliminar')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Mostrar entrada' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.getByText('cancelado')).toBeInTheDocument());
  });
});
