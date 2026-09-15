import React, { useState, useEffect } from 'react';
import { Upload, CheckCircle, AlertCircle, ArrowRight, LogOut } from 'lucide-react';
import api from './utils/api';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [currentStep, setCurrentStep] = useState('login'); // login, register, upload, jobs, dashboard
  const [loading, setLoading] = useState(false);
  const [cvs, setCvs] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedJobs, setSelectedJobs] = useState({});

  // Register
  const handleRegister = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    setLoading(true);

    try {
      const response = await api.post('/auth/register', {
        email: formData.get('email'),
        password: formData.get('password'),
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
      });

      localStorage.setItem('accessToken', response.data.accessToken);
      setUser(response.data.user);
      setCurrentStep('upload');
    } catch (error) {
      alert('Registration failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Login
  const handleLogin = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    setLoading(true);

    try {
      const response = await api.post('/auth/login', {
        email: formData.get('email'),
        password: formData.get('password'),
      });

      localStorage.setItem('accessToken', response.data.accessToken);
      setUser(response.data.user);
      setCurrentStep('dashboard');
      fetchCVs();
    } catch (error) {
      alert('Login failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Upload CV
  const handleCVUpload = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const fileName = formData.get('file').name;
    setLoading(true);

    try {
      const response = await api.post('/cvs/upload', {
        fileName,
      });

      setCvs([...cvs, { ...response.data, id: response.data.cvId }]);
      
      alert(`ATS Score: ${response.data.atsScore}/100\n\nSuggestions:\n${response.data.suggestions.map(s => `- ${s.title}`).join('\n')}`);
      
      fetchJobs(response.data.cvId);
      setCurrentStep('jobs');
    } catch (error) {
      alert('Upload failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Fetch CVs
  const fetchCVs = async () => {
    try {
      const response = await api.get('/cvs');
      setCvs(response.data.data);
    } catch (error) {
      console.error('Failed to fetch CVs:', error);
    }
  };

  // Fetch Jobs
  const fetchJobs = async (cvId) => {
    try {
      const response = await api.get(`/jobs/recommendations?cvId=${cvId}`);
      setJobs(response.data.data);
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    }
  };

  // Apply for jobs
  const handleApplyJobs = async (jobIds) => {
    if (cvs.length === 0) {
      alert('Please upload a CV first');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/applications', {
        jobIds,
        cvId: cvs[0].id,
      });

      alert(`Applied to ${jobIds.length} jobs successfully!\n${response.data.applicationsRemaining} applications remaining this month`);
      setCurrentStep('dashboard');
      setSelectedJobs({});
    } catch (error) {
      alert('Application failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    setUser(null);
    setCvs([]);
    setJobs([]);
    setSelectedJobs({});
    setCurrentStep('login');
  };

  // Login Step
  if (currentStep === 'login') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-center mb-2 text-gray-900">JobFit Pro</h1>
          <p className="text-center text-gray-600 mb-6">AI-powered job application assistant</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              name="email"
              placeholder="Email"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="password"
              name="password"
              placeholder="Password"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? 'Loading...' : 'Login'}
            </button>
          </form>

          <p className="text-center text-gray-600 mt-4">
            Don't have an account?{' '}
            <button
              onClick={() => setCurrentStep('register')}
              className="text-blue-600 font-semibold hover:underline"
            >
              Register
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Register Step
  if (currentStep === 'register') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-center mb-2 text-gray-900">Create Account</h1>

          <form onSubmit={handleRegister} className="space-y-4">
            <input
              type="text"
              name="firstName"
              placeholder="First Name"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              name="lastName"
              placeholder="Last Name"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="email"
              name="email"
              placeholder="Email"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="password"
              name="password"
              placeholder="Password"
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400"
            >
              {loading ? 'Loading...' : 'Register'}
            </button>
          </form>

          <p className="text-center text-gray-600 mt-4">
            Already have an account?{' '}
            <button
              onClick={() => setCurrentStep('login')}
              className="text-blue-600 font-semibold hover:underline"
            >
              Login
            </button>
          </p>
        </div>
      </div>
    );
  }

  // Upload CV Step
  if (currentStep === 'upload' && user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Upload Your CV</h1>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
            >
              <LogOut size={18} /> Logout
            </button>
          </div>

          <form onSubmit={handleCVUpload} className="bg-white rounded-lg shadow-lg p-8">
            <div className="border-2 border-dashed border-blue-300 rounded-lg p-8 text-center cursor-pointer hover:bg-blue-50 transition">
              <input
                type="file"
                name="file"
                accept=".pdf,.docx"
                required
                className="hidden"
                id="fileInput"
              />
              <label htmlFor="fileInput" className="cursor-pointer">
                <Upload className="w-12 h-12 text-blue-600 mx-auto mb-3" />
                <p className="font-semibold text-gray-900 mb-1">Click to upload</p>
                <p className="text-sm text-gray-500">PDF or DOCX</p>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center"
            >
              {loading ? 'Uploading...' : 'Upload CV'} <ArrowRight className="ml-2 w-5 h-5" />
            </button>
          </form>

          {cvs.length > 0 && (
            <div className="mt-8 bg-white rounded-lg shadow-lg p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Your CVs</h2>
              {cvs.map(cv => (
                <div key={cv.id} className="p-4 border border-gray-200 rounded-lg mb-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{cv.file_name}</p>
                    <p className="text-sm text-gray-600">ATS Score: {cv.ats_score}/100</p>
                  </div>
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Jobs Step
  if (currentStep === 'jobs' && user && jobs.length > 0) {
    const selectedCount = Object.values(selectedJobs).filter(Boolean).length;

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Recommended Jobs</h1>
              <p className="text-gray-600">We found {jobs.length} jobs matching your profile</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
            >
              <LogOut size={18} /> Logout
            </button>
          </div>

          <div className="space-y-4">
            {jobs.map(job => (
              <div key={job.id} className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-start gap-4">
                  <input
                    type="checkbox"
                    checked={selectedJobs[job.id] || false}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedJobs({...selectedJobs, [job.id]: true});
                      } else {
                        const newSelected = {...selectedJobs};
                        delete newSelected[job.id];
                        setSelectedJobs(newSelected);
                      }
                    }}
                    disabled={selectedCount >= 5 && !selectedJobs[job.id]}
                    className="mt-2 w-5 h-5"
                  />
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900">{job.title}</h3>
                    <p className="text-gray-600">{job.company}</p>
                    <p className="text-sm text-gray-500">{job.location}</p>
                    <div className="mt-3 flex gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{job.matchScore}%</div>
                        <div className="text-xs text-gray-600">Match</div>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">${job.salaryMin?.toLocaleString()}</div>
                        <div className="text-xs text-gray-600">to ${job.salaryMax?.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => {
              const selectedJobIds = Object.keys(selectedJobs).filter(id => selectedJobs[id]);
              handleApplyJobs(selectedJobIds);
            }}
            disabled={selectedCount === 0 || loading}
            className="w-full mt-8 bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400"
          >
            {loading ? 'Applying...' : `Apply to ${selectedCount} Job${selectedCount !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    );
  }

  // Dashboard
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome, {user?.firstName}!</h1>
              <p className="text-gray-600">Your job applications are being processed</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
            >
              <LogOut size={18} /> Logout
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-sm text-gray-600 mb-2">Total CVs</p>
              <p className="text-3xl font-bold text-blue-600">{cvs.length}</p>
            </div>
            <div className="p-6 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm text-gray-600 mb-2">Jobs Found</p>
              <p className="text-3xl font-bold text-green-600">{jobs.length}</p>
            </div>
            <div className="p-6 bg-purple-50 rounded-lg border border-purple-200">
              <p className="text-sm text-gray-600 mb-2">Plan</p>
              <p className="text-3xl font-bold text-purple-600">{user?.subscriptionType || 'free'}</p>
            </div>
          </div>

          <button
            onClick={() => setCurrentStep('upload')}
            className="mt-8 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            Upload New CV
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;