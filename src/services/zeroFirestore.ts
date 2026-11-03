import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signOut,
  type User
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  where
} from 'firebase/firestore';
import { isVerifiedCorporateAdmin } from './authorization';
import { mapZeroExportEvaluation, parseZeroCloudExportGroup, type ZeroCloudExportGroup } from './zeroExportContract';

const zeroFirebaseConfig = {
  apiKey: import.meta.env.VITE_ZERO_FIREBASE_API_KEY || 'AIzaSyC_LiPl1CgHd37e0wEfuAb-HxymQIWVAUg',
  authDomain: import.meta.env.VITE_ZERO_FIREBASE_AUTH_DOMAIN || 'tracksim-zero.firebaseapp.com',
  projectId: import.meta.env.VITE_ZERO_FIREBASE_PROJECT_ID || 'tracksim-zero',
  storageBucket: import.meta.env.VITE_ZERO_FIREBASE_STORAGE_BUCKET || 'tracksim-zero.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_ZERO_FIREBASE_MESSAGING_SENDER_ID || '120711426085',
  appId: import.meta.env.VITE_ZERO_FIREBASE_APP_ID || '1:120711426085:web:7bbbfa1c84c3499ece8fcc'
};

const zeroAppName = 'TrackSIMZeroCloudImport';
const zeroApp = getApps().some((app) => app.name === zeroAppName)
  ? getApp(zeroAppName)
  : initializeApp(zeroFirebaseConfig, zeroAppName);
const zeroAuth = getAuth(zeroApp);
const zeroDb = getFirestore(zeroApp);

type ExpectedAdmin = Pick<User, 'email' | 'emailVerified'>;

function assertAuthorizedZeroUser(user: User | null, expectedAdmin: ExpectedAdmin): asserts user is User {
  if (
    !user ||
    !isVerifiedCorporateAdmin(user.email, user.emailVerified) ||
    !isVerifiedCorporateAdmin(expectedAdmin.email, expectedAdmin.emailVerified) ||
    user.email?.trim().toLowerCase() !== expectedAdmin.email?.trim().toLowerCase()
  ) {
    throw new Error('ZERO requiere la misma cuenta Google corporativa verificada que está usando en CLOUD.');
  }
}

async function ensureZeroAuthentication(expectedAdmin: ExpectedAdmin): Promise<User> {
  if (!isVerifiedCorporateAdmin(expectedAdmin.email, expectedAdmin.emailVerified)) {
    throw new Error('La importación directa desde ZERO está limitada a administradores corporativos verificados.');
  }

  if (zeroAuth.currentUser?.email?.trim().toLowerCase() === expectedAdmin.email?.trim().toLowerCase()) {
    assertAuthorizedZeroUser(zeroAuth.currentUser, expectedAdmin);
    return zeroAuth.currentUser;
  }

  if (zeroAuth.currentUser) await signOut(zeroAuth);

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(zeroAuth, provider);
  try {
    assertAuthorizedZeroUser(result.user, expectedAdmin);
  } catch (error) {
    await signOut(zeroAuth);
    throw error;
  }
  return result.user;
}

function requireCurrentZeroAuthentication(expectedAdmin: ExpectedAdmin): void {
  assertAuthorizedZeroUser(zeroAuth.currentUser, expectedAdmin);
}

export async function connectToZeroAndListExports(expectedAdmin: ExpectedAdmin): Promise<ZeroCloudExportGroup[]> {
  await ensureZeroAuthentication(expectedAdmin);
  const snapshot = await getDocs(
    query(collection(zeroDb, 'cloud_exports'), where('status', '==', 'complete'))
  );
  const groups = snapshot.docs.map((entry) => parseZeroCloudExportGroup(entry.id, entry.data()));

  return groups.sort((a, b) => {
    const dateA = Date.parse(a.completedAt || a.closedAt || '');
    const dateB = Date.parse(b.completedAt || b.closedAt || '');
    return (Number.isFinite(dateB) ? dateB : 0) - (Number.isFinite(dateA) ? dateA : 0);
  });
}

export async function loadZeroExportEvaluations(
  groupId: string,
  expectedAdmin: ExpectedAdmin
): Promise<{ group: ZeroCloudExportGroup; evaluations: ReturnType<typeof mapZeroExportEvaluation>[] }> {
  requireCurrentZeroAuthentication(expectedAdmin);

  const groupSnapshot = await getDoc(doc(zeroDb, 'cloud_exports', groupId));
  if (!groupSnapshot.exists()) throw new Error(`No se encontró la exportación del grupo ${groupId} en ZERO.`);
  const group = parseZeroCloudExportGroup(groupSnapshot.id, groupSnapshot.data());

  const evaluationsSnapshot = await getDocs(
    collection(zeroDb, 'cloud_exports', groupId, 'evaluations')
  );
  if (evaluationsSnapshot.size !== group.expectedCount || evaluationsSnapshot.size !== group.exportedCount) {
    throw new Error(
      `La exportación de ${group.groupName} está incompleta: se esperaban ${group.expectedCount} expedientes y se leyeron ${evaluationsSnapshot.size}.`
    );
  }

  const evaluations = evaluationsSnapshot.docs.map((entry) =>
    mapZeroExportEvaluation(entry.id, entry.data(), group)
  );
  return { group, evaluations };
}
