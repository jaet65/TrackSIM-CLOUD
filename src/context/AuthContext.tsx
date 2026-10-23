import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import {
  auth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  googleProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from '../services/firebaseAuth';
import { UserProfile } from '../types';
import { isVerifiedCorporateAdmin } from '../services/authorization';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  userRole: 'admin' | 'viewer' | null;
  allowedCompanies: string[];
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'viewer' | null>(null);
  const [allowedCompanies, setAllowedCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // Cancelar el listener del perfil anterior (evita permission-denied tras cerrar sesión)
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }
      if (!currentUser) {
        setUser(null);
        setProfile(null);
        setUserRole(null);
        setAllowedCompanies([]);
        setLoading(false);
        return;
      }

      setUser(currentUser);
      const email = (currentUser.email || '').toLowerCase().trim();
      const isGoogleAuth = currentUser.providerData?.some((p) => p.providerId === 'google.com');

      if (isVerifiedCorporateAdmin(currentUser.email, currentUser.emailVerified)) {
        setUserRole('admin');
        setAllowedCompanies(['all']);
        setProfile({
          uid: currentUser.uid,
          email,
          displayName: currentUser.displayName || email,
          role: 'admin',
          empresaPermitida: 'all',
          empresasPermitidas: ['all']
        });
        setLoading(false);
        return;
      }

      // Viewer logic with domain check and Firestore user document
      setUserRole('viewer');
      let domainMatchedCompany: string | null = null;

      try {
        const { db, doc, getDoc, onSnapshot, setDoc } = await import('../services/firebaseFirestore');
        const emailParts = email.split('@');
        const userDomain = emailParts.length > 1 ? emailParts[1].trim() : '';

        if (userDomain) {
          try {
            const domainDocRef = doc(db, 'dominios_empresas', userDomain);
            const domainSnap = await getDoc(domainDocRef);
            if (domainSnap.exists()) {
              const dData = domainSnap.data();
              if (dData.empresa) domainMatchedCompany = dData.empresa;
            }
          } catch (e) {
            console.warn('Error verificando asignación por dominio:', e);
          }
        }

        const userDocRef = doc(db, 'usuarios', currentUser.uid);
        const userSnap = await getDoc(userDocRef);

        if (!userSnap.exists()) {
          const newUserData: UserProfile = {
            uid: currentUser.uid,
            email,
            role: 'viewer',
            empresaPermitida: domainMatchedCompany || '',
            empresasPermitidas: domainMatchedCompany ? [domainMatchedCompany] : [],
            metodoAcceso: isGoogleAuth ? 'google' : 'password',
            creadoPor: isGoogleAuth ? 'Google (Autoregistro)' : 'Autoregistro',
            autoregistro: true,
            dominioDetectado: userDomain,
            fechaAlta: new Date().toISOString()
          };
          try {
            await setDoc(userDocRef, newUserData);
          } catch (regErr) {
            console.warn('Error al autoguardar documento de usuario en Firestore:', regErr);
          }
        }

        // Suscribirse en tiempo real al documento del usuario para detectar asignaciones inmediatas del admin
        unsubProfile = onSnapshot(userDocRef, (snap) => {
          let allowed: string[] = [];
          if (domainMatchedCompany) {
            allowed = domainMatchedCompany === 'all' ? ['all'] : [domainMatchedCompany];
          } else if (snap && snap.exists()) {
            const uData = snap.data();
            if (uData.empresaPermitida && uData.empresaPermitida !== '') {
              allowed = uData.empresaPermitida === 'all' ? ['all'] : [uData.empresaPermitida];
            } else if (Array.isArray(uData.empresasPermitidas) && uData.empresasPermitidas.length > 0) {
              allowed = uData.empresasPermitidas;
            }
          }
          setAllowedCompanies(allowed);
          setProfile(snap && snap.exists() ? (snap.data() as UserProfile) : null);
          setLoading(false);
        }, (err) => {
          console.warn('Error en listener de usuario:', err);
          setLoading(false);
        });

      } catch (err) {
        console.warn('Error determinando empresa de usuario:', err);
        setAllowedCompanies([]);
        setLoading(false);
      }
    });

    return () => {
      if (unsubProfile) unsubProfile();
      unsubscribe();
    };
  }, []);

  const loginWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const loginWithEmail = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const registerWithEmail = async (email: string, pass: string) => {
    await createUserWithEmailAndPassword(auth, email, pass);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        userRole,
        allowedCompanies,
        loading,
        loginWithGoogle,
        loginWithEmail,
        registerWithEmail,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
