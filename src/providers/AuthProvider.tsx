import { createContext, useContext, type ReactNode } from "react";
import { trpc } from "./trpc";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
  lastLoginAt?: Date | null;
  createdAt?: Date | null;
};

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  refetchUser: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  refetchUser: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const utils = trpc.useUtils();
  const { data: user, isLoading, refetch } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 1000 * 30, // 30s
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
      refetch();
    },
  });

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
  };

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        refetchUser: refetch,
        logout: handleLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
