import { addDoc, collection, db, serverTimestamp } from './firebaseFirestore';
import { auth } from './firebaseAuth';

export type AuditCategory = 'acceso' | 'reporte' | 'usuarios' | 'datos' | 'seguridad';
export type AuditAction =
  | 'login'
  | 'logout'
  | 'crear'
  | 'modificar'
  | 'eliminar'
  | 'restaurar'
  | 'ver'
  | 'exportar'
  | 'imprimir'
  | 'autoregistro'
  | 'intento'
  | 'rechazar';

export interface AuditEntryInput {
  categoria: AuditCategory;
  accion: AuditAction;
  detalle?: string;
  empresas?: string[];
  cantidad?: number;
  metodo?: string;
  critico?: boolean;
  antes?: string;
  despues?: string;
}

export interface AuditEntry extends AuditEntryInput {
  id: string;
  actorUid: string;
  actorEmail: string;
  sesionId?: string;
  navegador?: string;
  fecha: Date | null;
}

export const AUDIT_COLLECTION = 'auditoria';
const MAX_DETAIL_LENGTH = 500;
const MAX_SNAPSHOT_LENGTH = 1200;
const MAX_USER_AGENT_LENGTH = 250;
const MAX_COMPANIES = 20;
const SESSION_KEY = 'tracksim_audit_session';

// Identifica la sesión del navegador para correlacionar eventos del mismo acceso
function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return 'sin-sesion';
  }
}

const truncate = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

const stable = (value: unknown) => JSON.stringify(value ?? null);

// Compara los campos indicados y devuelve solo los que cambiaron, como JSON legible (antes/después)
export function diffSnapshots(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
  keys: string[]
): { antes?: string; despues?: string; changed: string[] } {
  const prev: Record<string, unknown> = {};
  const next: Record<string, unknown> = {};
  const changed: string[] = [];
  keys.forEach((key) => {
    const a = before?.[key];
    const b = after[key];
    if (stable(a) !== stable(b)) {
      prev[key] = a ?? null;
      next[key] = b ?? null;
      changed.push(key);
    }
  });
  if (changed.length === 0) return { changed };
  return {
    antes: truncate(JSON.stringify(prev), MAX_SNAPSHOT_LENGTH),
    despues: truncate(JSON.stringify(next), MAX_SNAPSHOT_LENGTH),
    changed
  };
}

export const snapshotText = (value: unknown) => truncate(JSON.stringify(value), MAX_SNAPSHOT_LENGTH);

// Registro best-effort: un fallo de auditoría nunca debe interrumpir la operación principal.
export async function logAudit(entry: AuditEntryInput): Promise<void> {
  const user = auth.currentUser;
  if (!user || !user.email) return;
  try {
    const payload: Record<string, unknown> = {
      categoria: entry.categoria,
      accion: entry.accion,
      actorUid: user.uid,
      actorEmail: user.email.trim().toLowerCase(),
      sesionId: getSessionId(),
      fecha: serverTimestamp()
    };
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      payload.navegador = truncate(navigator.userAgent, MAX_USER_AGENT_LENGTH);
    }
    if (entry.detalle) payload.detalle = truncate(entry.detalle, MAX_DETAIL_LENGTH);
    const empresas = (entry.empresas || []).filter(Boolean);
    if (empresas.length) payload.empresas = Array.from(new Set(empresas)).slice(0, MAX_COMPANIES);
    if (typeof entry.cantidad === 'number') payload.cantidad = entry.cantidad;
    if (entry.metodo) payload.metodo = entry.metodo;
    if (entry.critico) payload.critico = true;
    if (entry.antes) payload.antes = truncate(entry.antes, MAX_SNAPSHOT_LENGTH);
    if (entry.despues) payload.despues = truncate(entry.despues, MAX_SNAPSHOT_LENGTH);
    await addDoc(collection(db, AUDIT_COLLECTION), payload);
  } catch (e) {
    console.warn('No se pudo registrar el evento de auditoría:', e);
  }
}
