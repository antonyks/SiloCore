import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Login from '../features/auth/pages/Login';
import NotFound from '../pages/NotFound';
import ProtectedRoute from './ProtectedRoute';
import Dashboard from '../features/analytics/pages/Dashboard';
import Home from '../features/chat/pages/Home';
import { UserRole } from '../types';
import { RootRedirect } from './RootRedirect';

const AppRoutes: React.FC = () => {

  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}/>}>
        <Route path="/analytics/dashboard" element={<Dashboard/>}/>
      </Route>
      <Route element={<ProtectedRoute allowedRoles={[UserRole.USER]}/>}>
        <Route path="/chat/home" element={<Home/>}/>
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default AppRoutes;