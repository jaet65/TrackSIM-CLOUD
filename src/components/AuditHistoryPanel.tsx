import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { db, collection, getDocs, query, orderBy, limit } from '../services/firebaseFirestore';
import { AUDIT_COLLECTION, AuditEntry } from '../services/auditLog';

const PAGE_LIMIT = 500;

type Filter = 'todos' | 'critico' | 'acceso' | 'reporte' | 'datos' | 'usuarios' | 'seguridad';

const ACTION_LABELS: Record<string, { icon: string; label: string; color: string }> = {
  login: { icon: '🔑', label: 'Inicio de sesión', color: '#38bdf8' },
  logout: { icon: '🚪', label: 'Cierre de sesión', color: '#94a3b8' },
  crear: { icon: '📥', label: 'Alta', color: '#22c55e' },
  modificar: { icon: '✏️', label: 'Modificación', color: '#f59e0b' },
  eliminar: { icon: '🗑️', label: 'Eliminación', color: '#ef4444' },
  restaurar: { icon: '♻️', label: 'Respaldo restaurado', color: '#a78bfa' },
  ver: { icon: '👁️', label: 'Consulta de reporte', color: '#38bdf8' },
  exportar: { icon: '📤', label: 'Exportación', color: '#f59e0b' },
  imprimir: { icon: '🖨️', label: 'Impresión / PDF', color: '#f59e0b' },
  autoregistro: { icon: '🆕', label: 'Autoregistro', color: '#a78bfa' },
  intento: { icon: '⚠️', label: 'Intento de borrado masivo', color: '#ef4444' },
  rechazar: { icon: '⛔', label: 'Operación no completada', color: '#ef4444' }
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'todos', label: 'Todo' },
  { id: 'critico', label: '🚨 Críticos' },
  { id: 'acceso', label: '🔑 Accesos' },
  { id: 'reporte', label: '📄 Reportes' },
  { id: 'datos', label: '👁️ Consultas y exportaciones' },
  { id: 'usuarios', label: '👥 Usuarios y dominios' },
  { id: 'seguridad', label: '🛡️ Seguridad' }
];

const formatDate = (d: Date | null) =>
  d ? d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' }) : '—';

export const AuditHistoryPanel: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('todos');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(query(collection(db, AUDIT_COLLECTION), orderBy('fecha', 'desc'), limit(PAGE_LIMIT)));
      setEntries(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            ...data,
            id: d.id,
            fecha: data.fecha?.toDate ? data.fecha.toDate() : null
          } as AuditEntry;
        })
      );
    } catch (e) {
      console.error('Error cargando historial:', e);
      setError('No se pudo cargar el historial de actividad.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter === 'critico' ? !e.critico : filter !== 'todos' && e.categoria !== filter) return false;
      if (!q) return true;
      return [e.actorEmail, e.detalle, e.sesionId, ...(e.empresas || [])].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [entries, filter, search]);

  return (
    <div className="card" style={{ width: '100%', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>🕘 Historial de Actividad ({visible.length})</h3>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Buscar usuario, empresa o detalle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: '0.4rem 0.7rem', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', borderRadius: '6px', color: 'inherit', minWidth: '240px' }}
          />
          <button type="button" className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
            🔄 Actualizar
          </button>
        </div>
      </div>

      <div style={{ padding: '0.75rem 1.25rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border-subtle)' }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`btn btn-sm ${filter === f.id ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="table-responsive" style={{ width: '100%', maxHeight: '560px', overflowY: 'auto' }}>
        <table className="custom-table" style={{ width: '100%', minWidth: '760px', fontSize: '0.85rem' }}>
          <thead>
            <tr>
              {['Fecha y hora', 'Usuario', 'Actividad', 'Empresa(s)', 'Detalle'].map((h) => (
                <th key={h} style={{ position: 'sticky', top: 0, zIndex: 1, padding: '0.4rem 0.75rem', background: 'var(--bg-card, #fff)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Cargando historial...</td></tr>
            ) : error ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#ef4444' }}>{error}</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No hay actividad registrada con estos filtros.</td></tr>
            ) : (
              visible.map((e) => {
                const meta = ACTION_LABELS[e.accion] || { icon: '•', label: e.accion, color: 'inherit' };
                return (
                  <tr key={e.id} style={e.critico ? { background: 'rgba(239, 68, 68, 0.08)' } : undefined}>
                    <td style={{ padding: '0.3rem 0.75rem', whiteSpace: 'nowrap' }}>{formatDate(e.fecha)}</td>
                    <td style={{ padding: '0.3rem 0.75rem' }}>{e.actorEmail}</td>
                    <td style={{ padding: '0.3rem 0.75rem', whiteSpace: 'nowrap', color: meta.color, fontWeight: 600 }}>
                      {e.critico && <span title="Evento crítico">🚨 </span>}
                      {meta.icon} {meta.label}
                      {typeof e.cantidad === 'number' && ['reporte', 'datos', 'seguridad'].includes(e.categoria) ? ` (${e.cantidad})` : ''}
                    </td>
                    <td style={{ padding: '0.3rem 0.75rem' }}>{e.empresas?.join(', ') || '—'}</td>
                    <td style={{ padding: '0.3rem 0.75rem', color: 'var(--text-muted)' }}>
                      {e.categoria === 'acceso' ? (e.metodo ? (e.metodo === 'google' ? 'Google' : 'Correo / contraseña') : '—') : e.detalle || '—'}
                      {(e.antes || e.despues || e.sesionId || e.navegador) && (
                        <details style={{ marginTop: '0.2rem' }}>
                          <summary style={{ cursor: 'pointer', fontSize: '0.75rem' }}>Ver más</summary>
                          <div style={{ fontSize: '0.74rem', wordBreak: 'break-word' }}>
                            {e.antes && <div><strong>Antes:</strong> <code>{e.antes}</code></div>}
                            {e.despues && <div><strong>Después:</strong> <code>{e.despues}</code></div>}
                            {e.sesionId && <div><strong>Sesión:</strong> {e.sesionId}</div>}
                            {e.navegador && <div><strong>Navegador:</strong> {e.navegador}</div>}
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {entries.length >= PAGE_LIMIT && (
        <div style={{ padding: '0.6rem 1.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Mostrando los {PAGE_LIMIT} eventos más recientes.
        </div>
      )}
    </div>
  );
};
