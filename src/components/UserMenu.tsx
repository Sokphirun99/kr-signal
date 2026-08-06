import { Link } from "react-router";
import { useAuth } from "@/providers/AuthProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LogOut, LogIn } from "lucide-react";

export function UserMenu() {
  const { user, isLoading, logout } = useAuth();

  if (isLoading) {
    return (
      <div className="h-8 w-8 rounded-full bg-white/5 animate-pulse" />
    );
  }

  if (!user) {
    return (
      <Link
        to="/login"
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all duration-150 shadow-xs"
      >
        <LogIn className="h-3.5 w-3.5" />
        <span>Sign In</span>
      </Link>
    );
  }

  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user.email.slice(0, 2).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-emerald-500/40 transition-all focus:outline-hidden"
          aria-label="User account menu"
        >
          <Avatar className="h-8 w-8 border border-emerald-500/30 bg-emerald-950 text-emerald-300 font-semibold text-xs shadow-xs">
            <AvatarFallback className="bg-emerald-950 text-emerald-400">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 bg-[#0a0f0d] border border-white/10 text-zinc-200 shadow-xl rounded-xl p-1"
      >
        <DropdownMenuLabel className="font-normal p-2.5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-white truncate">
                {user.name || "User"}
              </span>
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 uppercase font-mono ${
                  user.role === "admin"
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : "border-white/15 bg-white/5 text-zinc-400"
                }`}
              >
                {user.role}
              </Badge>
            </div>
            <span className="text-xs text-zinc-400 truncate">{user.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/10" />

        <DropdownMenuItem
          onClick={() => logout()}
          className="flex items-center gap-2 text-xs font-medium text-rose-400 hover:bg-rose-500/15 hover:text-rose-300 rounded-lg p-2 cursor-pointer transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign Out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
