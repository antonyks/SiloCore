import React, { useState } from 'react';
import { useLogout } from '../../features/auth/hooks/useAuth';
import { useNavigate } from "react-router-dom";
import type { User } from '../../types/user';

interface UserProfileDropdownProps {
  user?: User | null;
}

const UserProfileDropdown: React.FC<UserProfileDropdownProps> = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const logout = useLogout();

  const toggleDropdown = () => {
    setIsOpen(!isOpen);
  };

  const handleLogout = () => {
    logout();
    setIsOpen(false);
  };

  const handleProfileClick = () => {
    navigate('/profile');
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
          {user?.name?.charAt(0).toUpperCase() || 'U'}
        </div>
        <span className="hidden max-w-32 truncate sm:inline">{user?.name || "Admin"}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-52 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          <div className="border-b border-slate-100 px-4 py-2 text-left">
            <div className="truncate text-sm font-medium text-slate-900">{user?.name || "Admin"}</div>
            <div className="truncate text-xs text-slate-500">{user?.email}</div>
          </div>
          <button
            onClick={handleProfileClick}
            className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
          >
            Profile
          </button>
          <button
            onClick={handleLogout}
            className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
};

export default UserProfileDropdown;
