import React, { useState, useEffect, useRef } from 'react';
import { CatalogExercise, getActiveCatalog, persistCatalogLocally, EXERCISE_CATALOG, parseCatalogCsv, serializeCatalogCsv } from '../services/exerciseCatalog';
import { db, doc, getDoc, setDoc } from '../services/firebaseFirestore';
import { logAudit } from '../services/auditLog';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface ExerciseCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCatalogUpdated?: (catalog: CatalogExercise[]) => void;
}

export const ExerciseCatalogModal: React.FC<ExerciseCatalogModalProps> = ({
  isOpen,
  onClose,
  onCatalogUpdated
}) => {
  const [exercises, setExercises] = useState<CatalogExercise[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  // Formulario de creación / edición
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const importFileRef = useRef<HTMLInputElement>(null);

  useEscapeKey(isOpen, onClose);

  // Cargar catálogo de Firestore y sincronizar
  const loadCatalog = async () => {
    setLoading(true);
    try {
      const docRef = doc(db, 'configuracion', 'catalogo_ejercicios');
      const snap = await getDoc(docRef);
      if (snap.exists() && Array.isArray(snap.data()?.ejercicios)) {
        const loaded: CatalogExercise[] = snap.data().ejercicios;
        setExercises(loaded);
        persistCatalogLocally(loaded);
        if (onCatalogUpdated) onCatalogUpdated(loaded);
      } else {
        // Usar catálogo base
        const current = getActiveCatalog();
        setExercises(current);
      }
    } catch (err) {
      console.warn('Error obteniendo catálogo de Firestore, usando almacenamiento local:', err);
      setExercises(getActiveCatalog());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCatalog();
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setEditingIndex(null);
    setNombre('');
    setDescripcion('');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleStartEdit = (idx: number) => {
    setEditingIndex(idx);
    setNombre(exercises[idx].nombre);
    setDescripcion(exercises[idx].descripcion);
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleSaveExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) {
      setErrorMsg('El nombre del ejercicio es obligatorio.');
      return;
    }

    const trimmedNombre = nombre.trim();
    const trimmedDesc = descripcion.trim();

    // Validar duplicados si es nuevo o si cambió el nombre
    const isDuplicate = exercises.some((ex, i) =>
      i !== editingIndex && ex.nombre.toLowerCase().trim() === trimmedNombre.toLowerCase()
    );

    if (isDuplicate) {
      setErrorMsg(`Ya existe un ejercicio con el nombre "${trimmedNombre}".`);
      return;
    }

    let updatedList: CatalogExercise[];
    if (editingIndex !== null) {
      updatedList = exercises.map((item, i) =>
        i === editingIndex ? { nombre: trimmedNombre, descripcion: trimmedDesc } : item
      );
    } else {
      updatedList = [...exercises, { nombre: trimmedNombre, descripcion: trimmedDesc }];
    }

    setIsSaving(true);
    try {
      // Guardar en Firestore
      await setDoc(
        doc(db, 'configuracion', 'catalogo_ejercicios'),
        { ejercicios: updatedList, updatedAt: new Date().toISOString() },
        { merge: true }
      );

      // Guardar local
      void logAudit({ categoria: 'usuarios', accion: 'modificar', detalle: 'Catálogo de ejercicios actualizado' });
      persistCatalogLocally(updatedList);
      setExercises(updatedList);
      if (onCatalogUpdated) onCatalogUpdated(updatedList);

      setSuccessMsg(editingIndex !== null ? '¡Ejercicio actualizado con éxito!' : '¡Ejercicio agregado con éxito!');
      resetForm();
    } catch (err) {
      console.error('Error al guardar ejercicio:', err);
      setErrorMsg('Ocurrió un error al guardar en la nube. Se mantuvo en memoria local.');
      persistCatalogLocally(updatedList);
      setExercises(updatedList);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteExercise = async (idx: number) => {
    const target = exercises[idx];
    if (!window.confirm(`¿Estás seguro de eliminar el ejercicio "${target.nombre}" del catálogo?`)) {
      return;
    }

    const updatedList = exercises.filter((_, i) => i !== idx);
    setIsSaving(true);
    try {
      await setDoc(
        doc(db, 'configuracion', 'catalogo_ejercicios'),
        { ejercicios: updatedList, updatedAt: new Date().toISOString() },
        { merge: true }
      );

      void logAudit({ categoria: 'usuarios', accion: 'eliminar', detalle: `Ejercicio "${target.nombre}" eliminado del catálogo` });
      persistCatalogLocally(updatedList);
      setExercises(updatedList);
      if (onCatalogUpdated) onCatalogUpdated(updatedList);
      setSuccessMsg(`Ejercicio "${target.nombre}" eliminado.`);
      if (editingIndex === idx) resetForm();
    } catch (err) {
      console.error('Error al eliminar:', err);
      setErrorMsg('Error al sincronizar eliminación con Firestore.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreDefaults = async () => {
    if (!window.confirm('¿Restablecer el catálogo a los ejercicios oficiales de fábrica?')) {
      return;
    }

    setIsSaving(true);
    try {
      await setDoc(
        doc(db, 'configuracion', 'catalogo_ejercicios'),
        { ejercicios: EXERCISE_CATALOG, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      void logAudit({ categoria: 'usuarios', accion: 'modificar', detalle: 'Catálogo de ejercicios restablecido a valores oficiales' });
      persistCatalogLocally(EXERCISE_CATALOG);
      setExercises([...EXERCISE_CATALOG]);
      if (onCatalogUpdated) onCatalogUpdated([...EXERCISE_CATALOG]);
      setSuccessMsg('Catálogo restablecido a los valores oficiales.');
      resetForm();
    } catch (err) {
      console.error('Error restableciendo:', err);
      setErrorMsg('Error restableciendo catálogo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCatalog = () => {
    const blob = new Blob([serializeCatalogCsv(exercises)], {
      type: 'text/csv;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `catalogo_ejercicios_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    void logAudit({
      categoria: 'datos',
      accion: 'exportar',
      cantidad: exercises.length,
      detalle: 'Exportación CSV del catálogo de ejercicios'
    });
    setErrorMsg('');
    setSuccessMsg(`Catálogo exportado correctamente (${exercises.length} ejercicios).`);
  };

  const handleImportCatalog = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    let importedCatalog: CatalogExercise[];
    try {
      importedCatalog = parseCatalogCsv(await file.text());
    } catch (err) {
      setSuccessMsg('');
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo leer el archivo seleccionado.');
      return;
    }

    if (!window.confirm(`Se reemplazará todo el catálogo actual por ${importedCatalog.length} ejercicios. ¿Deseas continuar?`)) {
      return;
    }

    setIsSaving(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await setDoc(
        doc(db, 'configuracion', 'catalogo_ejercicios'),
        { ejercicios: importedCatalog, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      void logAudit({
        categoria: 'datos',
        accion: 'modificar',
        cantidad: importedCatalog.length,
        detalle: 'Importación CSV del catálogo de ejercicios'
      });
      persistCatalogLocally(importedCatalog);
      setExercises(importedCatalog);
      if (onCatalogUpdated) onCatalogUpdated(importedCatalog);
      resetForm();
      setSuccessMsg(`Catálogo importado correctamente (${importedCatalog.length} ejercicios).`);
    } catch (err) {
      console.error('Error al importar catálogo:', err);
      persistCatalogLocally(importedCatalog);
      setExercises(importedCatalog);
      if (onCatalogUpdated) onCatalogUpdated(importedCatalog);
      setErrorMsg('No se pudo sincronizar con la nube. El catálogo importado quedó guardado localmente.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const filteredExercises = exercises.filter((ex) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return ex.nombre.toLowerCase().includes(q) || ex.descripcion.toLowerCase().includes(q);
  });

  return (
    <div
      className="modal-overlay active"
      onClick={onClose}
      style={{
        zIndex: 1100,
        backgroundColor: 'var(--modal-backdrop)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem'
      }}
    >
      <div
        className="modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '95%',
          maxWidth: '850px',
          maxHeight: '90vh',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-card)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Encabezado */}
        <div
          style={{
            padding: '1.25rem 1.75rem',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--bg-card)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'var(--primary-glow)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.3rem'
              }}
            >
              📚
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>
                Catálogo Oficial de Ejercicios
              </h3>
              <p style={{ margin: '0.15rem 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Gestiona y personaliza las variantes de simulación y sus descripciones oficiales
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '1.4rem',
              cursor: 'pointer',
              padding: '0.2rem 0.5rem',
              borderRadius: '6px'
            }}
            title="Cerrar ventana"
          >
            ✕
          </button>
        </div>

        {/* Mensajes de Feedback */}
        {errorMsg && (
          <div style={{ padding: '0.75rem 1.75rem', background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: '0.85rem', borderBottom: '1px solid var(--danger-border)' }}>
            ⚠️ {errorMsg}
          </div>
        )}
        {successMsg && (
          <div style={{ padding: '0.75rem 1.75rem', background: 'var(--success-bg)', color: 'var(--success)', fontSize: '0.85rem', borderBottom: '1px solid var(--success-border)' }}>
            ✅ {successMsg}
          </div>
        )}

        {/* Cuerpo Modal */}
        <div style={{ padding: '1.5rem 1.75rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Formulario de Agregar / Editar */}
          <form
            onSubmit={handleSaveExercise}
            style={{
              background: 'var(--bg-app)',
              border: '1px solid var(--border-glow)',
              borderRadius: '12px',
              padding: '1.25rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--primary)' }}>
                {editingIndex !== null ? '✏️ Modificar Ejercicio' : '➕ Agregar Nuevo Ejercicio'}
              </span>
              {editingIndex !== null && (
                <button
                  type="button"
                  onClick={resetForm}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Cancelar Edición
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Nombre del Ejercicio (ej: Montaña, Reparto, Enrampe, etc.) *
                </label>
                <input
                  type="text"
                  placeholder="Escribe el nombre del ejercicio..."
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.85rem',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    color: 'var(--text-main)',
                    fontSize: '0.88rem'
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                  Descripción / Objetivo Pedagógico
                </label>
                <textarea
                  placeholder="Detalla el objetivo y criterios de retroalimentación de este ejercicio..."
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.85rem',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px',
                    color: 'var(--text-main)',
                    fontSize: '0.85rem',
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', gap: '0.5rem' }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSaving}
                style={{ fontSize: '0.85rem', padding: '0.5rem 1.25rem' }}
              >
                {isSaving ? 'Guardando...' : editingIndex !== null ? '💾 Guardar Cambios' : '➕ Añadir al Catálogo'}
              </button>
            </div>
          </form>

          {/* Lista de Ejercicios Existentes */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                  Ejercicios en Catálogo ({exercises.length})
                </span>
                {loading && <span style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>Cargando...</span>}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleImportCatalog}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={handleExportCatalog}
                  disabled={loading || isSaving}
                  title="Descarga el catálogo actual como archivo CSV"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                    padding: '0.35rem 0.65rem',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    cursor: 'pointer'
                  }}
                >
                  ↓ Exportar CSV
                </button>
                <button
                  type="button"
                  onClick={() => importFileRef.current?.click()}
                  disabled={loading || isSaving}
                  title="Importa un archivo CSV y reemplaza el catálogo actual"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                    padding: '0.35rem 0.65rem',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    cursor: 'pointer'
                  }}
                >
                  ↑ Importar CSV
                </button>
                <input
                  type="text"
                  placeholder="Buscar ejercicio..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    color: 'var(--text-main)',
                    fontSize: '0.8rem'
                  }}
                />
                <button
                  type="button"
                  onClick={handleRestoreDefaults}
                  disabled={isSaving}
                  title="Restablece la lista a los 9 ejercicios estándar iniciales"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                    padding: '0.35rem 0.65rem',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    cursor: 'pointer'
                  }}
                >
                  ↺ Valores de Fábrica
                </button>
              </div>
            </div>

            {filteredExercises.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: '10px' }}>
                No se encontraron ejercicios con ese criterio de búsqueda.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {filteredExercises.map((ex) => {
                  const actualIndex = exercises.findIndex((e) => e.nombre === ex.nombre);
                  const isCurrentEditing = editingIndex === actualIndex;

                  return (
                    <div
                      key={ex.nombre}
                      style={{
                        padding: '0.85rem 1.1rem',
                        background: isCurrentEditing ? 'var(--primary-glow)' : 'var(--bg-card)',
                        border: isCurrentEditing ? '1px solid var(--border-glow)' : '1px solid var(--border-subtle)',
                        borderRadius: '10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '1rem',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.92rem' }}>
                            🚚 {ex.nombre}
                          </span>
                        </div>
                        <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: '1.35' }}>
                          {ex.descripcion || <em style={{ opacity: 0.6 }}>Sin descripción asignada</em>}
                        </p>
                      </div>

                      <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleStartEdit(actualIndex)}
                          title="Editar este ejercicio"
                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                        >
                          ✏️ Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteExercise(actualIndex)}
                          title="Eliminar este ejercicio del catálogo"
                          style={{ padding: '0.25rem 0.55rem', fontSize: '0.8rem' }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.75rem',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'var(--bg-card)'
          }}
        >
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{ fontSize: '0.85rem' }}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
