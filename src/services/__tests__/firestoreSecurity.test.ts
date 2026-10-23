import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';

const PROJECT_ID = 'demo-tracksim-cloud';
const FIRESTORE_HOST = '127.0.0.1';
const FIRESTORE_PORT = 8080;

describe('Firestore Security Rules', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        host: FIRESTORE_HOST,
        port: FIRESTORE_PORT,
        rules: readFileSync('firestore.rules', 'utf8')
      }
    });
  }, 30000);

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore();
      await Promise.all([
        setDoc(doc(firestore, 'dominios_empresas/lacostena.com.mx'), { empresa: 'Empresa A' }),
        setDoc(doc(firestore, 'dominios_empresas/other-company.example'), { empresa: 'Empresa B' }),
        setDoc(doc(firestore, 'dominios_empresas/all.example'), { empresa: 'all' }),
        setDoc(doc(firestore, 'evaluaciones/evaluation-a'), { empresa: 'Empresa A' }),
        setDoc(doc(firestore, 'evaluaciones/evaluation-b'), { empresa: 'Empresa B' }),
        setDoc(doc(firestore, 'conductores/driver-a'), { empresa: 'Empresa A' }),
        setDoc(doc(firestore, 'conductores/driver-b'), { empresa: 'Empresa B' }),
        setDoc(doc(firestore, 'configuracion/catalogo_ejercicios'), { ejercicios: [] }),
        setDoc(doc(firestore, 'configuracion/internal-settings'), { secret: 'admin-only' }),
        setDoc(doc(firestore, '_eliminaciones/deletion-a'), {
          empresa: 'Empresa A',
          deletedAt: '2026-10-23T00:00:00.000Z',
          ids: ['evaluation-a']
        }),
        setDoc(doc(firestore, '_eliminaciones/deletion-b'), {
          empresa: 'Empresa B',
          deletedAt: '2026-10-23T00:00:00.000Z',
          ids: ['evaluation-b']
        }),
        setDoc(doc(firestore, 'usuarios/profile-user'), {
          role: 'viewer',
          empresaPermitida: '',
          empresasPermitidas: ['Empresa B']
        }),
        setDoc(doc(firestore, 'usuarios/other-user'), {
          role: 'viewer',
          empresaPermitida: '',
          empresasPermitidas: []
        })
      ]);
    });
  });

  it('denies evaluation reads to unauthenticated users', async () => {
    const firestore = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(firestore, 'evaluaciones/evaluation-a')));
  });

  it('allows a domain-assigned viewer to read only their company evaluations', async () => {
    const firestore = testEnv.authenticatedContext('domain-user', {
      email: 'viewer@lacostena.com.mx',
      email_verified: true
    }).firestore();

    await assertSucceeds(getDoc(doc(firestore, 'evaluaciones/evaluation-a')));
    await assertFails(getDoc(doc(firestore, 'evaluaciones/evaluation-b')));
  });

  it('allows a viewer to read companies assigned in their user profile', async () => {
    const firestore = testEnv.authenticatedContext('profile-user', {
      email: 'viewer@unassigned.example',
      email_verified: true
    }).firestore();

    await assertSucceeds(getDoc(doc(firestore, 'evaluaciones/evaluation-b')));
    await assertFails(getDoc(doc(firestore, 'evaluaciones/evaluation-a')));
  });

  it('allows a domain mapped to all companies to read each company', async () => {
    const firestore = testEnv.authenticatedContext('all-user', {
      email: 'viewer@all.example',
      email_verified: true
    }).firestore();

    await assertSucceeds(getDoc(doc(firestore, 'evaluaciones/evaluation-a')));
    await assertSucceeds(getDoc(doc(firestore, 'evaluaciones/evaluation-b')));
  });

  it('allows a verified corporate admin to create, update, and delete evaluations', async () => {
    const firestore = testEnv.authenticatedContext('admin-user', {
      email: 'admin@corporativomaf.com',
      email_verified: true
    }).firestore();
    const evaluation = doc(firestore, 'evaluaciones/new-evaluation');

    await assertSucceeds(setDoc(evaluation, { empresa: 'Empresa A' }));
    await assertSucceeds(updateDoc(evaluation, { empresa: 'Empresa B' }));
    await assertSucceeds(deleteDoc(evaluation));

    const uppercaseEmailAdmin = testEnv.authenticatedContext('uppercase-admin', {
      email: 'ADMIN@CORPORATIVOMAF.COM',
      email_verified: true
    }).firestore();
    await assertSucceeds(setDoc(doc(uppercaseEmailAdmin, 'evaluaciones/uppercase-admin-evaluation'), {
      empresa: 'Empresa A'
    }));
  });

  it('denies evaluation writes to an unverified corporate email', async () => {
    const firestore = testEnv.authenticatedContext('unverified-admin', {
      email: 'admin@corporativomaf.com',
      email_verified: false
    }).firestore();

    await assertFails(setDoc(doc(firestore, 'evaluaciones/forbidden'), { empresa: 'Empresa A' }));
  });

  it('allows self-registration only as a viewer with a domain-assigned company', async () => {
    const allowedViewer = testEnv.authenticatedContext('allowed-viewer', {
      email: 'new@lacostena.com.mx',
      email_verified: true
    }).firestore();

    await assertSucceeds(setDoc(doc(allowedViewer, 'usuarios/allowed-viewer'), {
      role: 'viewer',
      empresaPermitida: 'Empresa A',
      empresasPermitidas: ['Empresa A']
    }));

    const mismatchedCompanyViewer = testEnv.authenticatedContext('mismatched-company', {
      email: 'new@lacostena.com.mx'
    }).firestore();
    await assertFails(setDoc(doc(mismatchedCompanyViewer, 'usuarios/mismatched-company'), {
      role: 'viewer',
      empresaPermitida: 'Empresa B',
      empresasPermitidas: ['Empresa B']
    }));

    const escalatedViewer = testEnv.authenticatedContext('escalated-viewer', {
      email: 'new@lacostena.com.mx'
    }).firestore();
    await assertFails(setDoc(doc(escalatedViewer, 'usuarios/escalated-viewer'), {
      role: 'admin',
      empresaPermitida: 'Empresa A',
      empresasPermitidas: ['Empresa A']
    }));

    const multipleCompaniesViewer = testEnv.authenticatedContext('multiple-companies', {
      email: 'new@lacostena.com.mx'
    }).firestore();
    await assertFails(setDoc(doc(multipleCompaniesViewer, 'usuarios/multiple-companies'), {
      role: 'viewer',
      empresaPermitida: 'Empresa A',
      empresasPermitidas: ['Empresa A', 'Empresa B']
    }));
  });

  it('allows users to read only their own profile unless they are admins', async () => {
    const viewer = testEnv.authenticatedContext('profile-user', {
      email: 'viewer@unassigned.example',
      email_verified: true
    }).firestore();
    const admin = testEnv.authenticatedContext('admin-user', {
      email: 'admin@corporativomaf.com',
      email_verified: true
    }).firestore();

    await assertSucceeds(getDoc(doc(viewer, 'usuarios/profile-user')));
    await assertFails(getDoc(doc(viewer, 'usuarios/other-user')));
    await assertSucceeds(getDoc(doc(admin, 'usuarios/other-user')));
  });

  it('allows viewers to read only their own domain mapping', async () => {
    const viewer = testEnv.authenticatedContext('domain-user', {
      email: 'viewer@lacostena.com.mx',
      email_verified: true
    }).firestore();
    const admin = testEnv.authenticatedContext('admin-user', {
      email: 'admin@corporativomaf.com',
      email_verified: true
    }).firestore();

    await assertSucceeds(getDoc(doc(viewer, 'dominios_empresas/lacostena.com.mx')));
    await assertFails(getDoc(doc(viewer, 'dominios_empresas/other-company.example')));
    await assertFails(getDocs(collection(viewer, 'dominios_empresas')));
    await assertSucceeds(getDocs(collection(admin, 'dominios_empresas')));
  });

  it('limits conductor reads to the assigned company', async () => {
    const viewer = testEnv.authenticatedContext('domain-user', {
      email: 'viewer@lacostena.com.mx',
      email_verified: true
    }).firestore();

    await assertSucceeds(getDoc(doc(viewer, 'conductores/driver-a')));
    await assertFails(getDoc(doc(viewer, 'conductores/driver-b')));
  });

  it('allows viewers to read only the shared exercise catalog in configuration', async () => {
    const viewer = testEnv.authenticatedContext('domain-user', {
      email: 'viewer@lacostena.com.mx',
      email_verified: true
    }).firestore();
    const admin = testEnv.authenticatedContext('admin-user', {
      email: 'admin@corporativomaf.com',
      email_verified: true
    }).firestore();

    await assertSucceeds(getDoc(doc(viewer, 'configuracion/catalogo_ejercicios')));
    await assertFails(getDoc(doc(viewer, 'configuracion/internal-settings')));
    await assertSucceeds(getDoc(doc(admin, 'configuracion/internal-settings')));
  });

  it('allows viewers to read and query only deletion tombstones for their company', async () => {
    const viewer = testEnv.authenticatedContext('domain-user', {
      email: 'viewer@lacostena.com.mx',
      email_verified: true
    }).firestore();

    await assertSucceeds(getDoc(doc(viewer, '_eliminaciones/deletion-a')));
    await assertFails(getDoc(doc(viewer, '_eliminaciones/deletion-b')));
    await assertSucceeds(getDocs(query(
      collection(viewer, '_eliminaciones'),
      where('empresa', '==', 'Empresa A')
    )));
    await assertFails(getDocs(collection(viewer, '_eliminaciones')));
  });
});
