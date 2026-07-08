import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Login from '../features/auth/pages/Login';
import NotFound from '../pages/NotFound';
import ProtectedRoute from './ProtectedRoute';
import Dashboard from '../features/analytics/pages/Dashboard';
import ProviderConfigsPage from '../features/analytics/pages/ProviderConfigsPage';
import ModelRegistryPage from '../features/analytics/pages/ModelRegistryPage';
import UserDirectoryPage from '../features/analytics/pages/UserDirectoryPage';
import UserAccessPage from '../features/analytics/pages/UserAccessPage';
import Home from '../features/chat/pages/Home';
import { UserRole } from '../types';
import { RootRedirect } from './RootRedirect';
import AdminLayout from '../components/layout/AdminLayout';

const AppRoutes: React.FC = () => {

  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}/>}>
        <Route element={<AdminLayout />}>
          <Route path="/analytics/dashboard" element={<Dashboard/>}/>
          <Route
            path="/admin/llm/providers"
            element={<ProviderConfigsPage />}
          />
          <Route
            path="/admin/llm/models"
            element={<ModelRegistryPage />}
          />
          <Route
            path="/admin/users"
            element={<UserDirectoryPage />}
          />
          <Route
            path="/admin/users/access"
            element={<UserAccessPage />}
          />
        </Route>
      </Route>
      <Route element={<ProtectedRoute allowedRoles={[UserRole.USER]}/>}>
        <Route path="/chat/home" element={<Home/>}/>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default AppRoutes;
