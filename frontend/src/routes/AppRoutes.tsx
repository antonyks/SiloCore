import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Login from '../features/auth/pages/Login';
import NotFound from '../pages/NotFound';
import ProtectedRoute from './ProtectedRoute';
import Dashboard from '../features/analytics/pages/Dashboard';
import AdminPlaceholderPage from '../features/analytics/pages/AdminPlaceholderPage';
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
            element={
              <AdminPlaceholderPage
                title="Provider Configs"
                description="Provider configuration management will be implemented in the next admin task. The overview dashboard already shows the current read-only provider status."
              />
            }
          />
          <Route
            path="/admin/llm/models"
            element={
              <AdminPlaceholderPage
                title="Model Registry"
                description="The dedicated model registry view will expand the current read-only dashboard inventory in a later task."
              />
            }
          />
          <Route
            path="/admin/users"
            element={
              <AdminPlaceholderPage
                title="User Directory"
                description="The dedicated user directory will add search, pagination, create, and edit workflows in a later task without exposing chat contents."
              />
            }
          />
          <Route
            path="/admin/users/access"
            element={
              <AdminPlaceholderPage
                title="Access & Bans"
                description="Ban, reactivate, and soft-delete controls are intentionally deferred to the access control task."
              />
            }
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
