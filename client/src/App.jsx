import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import loadable from '@loadable/component';
import PageLoader from './components/PageLoader';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

const MashcloudHome = loadable(() => import('./components/MashcloudHome'), {
  fallback: <PageLoader appName="Mashcloud" type="dashboard" />
});

const SignIn = loadable(() => import('./components/SignIn'), {
  fallback: <PageLoader appName="Mashcloud" type="dashboard" />
});

const Dashboard = loadable(() => import('./components/Dashboard'), {
  fallback: <PageLoader appName="Mashcloud" type="dashboard" />
});

const Photos = loadable(() => import('./components/Photos'), {
  fallback: <PageLoader appName="Mashcloud Photos" type="photos" />
});

const Drive = loadable(() => import('./components/Drive'), {
  fallback: <PageLoader appName="Mashcloud Drive" type="drive" />
});

const Settings = loadable(() => import('./components/Settings'), {
  fallback: <PageLoader appName="Mashcloud Settings" type="dashboard" />
});

const Terms = loadable(() => import('./components/Terms'), {
  fallback: <PageLoader appName="Mashcloud" type="dashboard" />
});

const Privacy = loadable(() => import('./components/Privacy'), {
  fallback: <PageLoader appName="Mashcloud" type="dashboard" />
});

const Plan = loadable(() => import('./components/Plan'), {
  fallback: <PageLoader appName="Mashcloud" type="dashboard" />
});

const StoragePage = loadable(() => import('./components/Storage'), {
  fallback: <PageLoader appName="Mashcloud" type="dashboard" />
});

const DataRecovery = loadable(() => import('./components/DataRecovery'), {
  fallback: <PageLoader appName="Mashcloud" type="dashboard" />
});

const ForgotPassword = loadable(() => import('./components/ForgotPassword'), {
  fallback: <PageLoader appName="Mashcloud" type="dashboard" />
});

const ResetPassword = loadable(() => import('./components/ResetPassword'), {
  fallback: <PageLoader appName="Mashcloud" type="dashboard" />
});

const Contact = loadable(() => import('./components/Contact'), {
  fallback: <PageLoader appName="Mashcloud" type="dashboard" />
});

const ComplianceCenter = loadable(() => import('./components/ComplianceCenter'), {
  fallback: <PageLoader appName="Mashcloud Trust Center" type="dashboard" />
});

const NotFound = loadable(() => import('./components/NotFound'), {
  fallback: <PageLoader appName="Mashcloud" type="dashboard" />
});

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<MashcloudHome />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/photos" element={<ProtectedRoute><Photos /></ProtectedRoute>} />
          <Route path="/drive" element={<ProtectedRoute><Drive /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/compliance" element={<ProtectedRoute><ComplianceCenter /></ProtectedRoute>} />
          <Route path="/plan" element={<ProtectedRoute><Plan /></ProtectedRoute>} />
          <Route path="/storage" element={<ProtectedRoute><StoragePage /></ProtectedRoute>} />
          <Route path="/data-recovery" element={<ProtectedRoute><DataRecovery /></ProtectedRoute>} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
