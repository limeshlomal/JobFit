import React, { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle, ArrowRight, LogOut, FileText, Download, Mail, Phone, User, Eye, Sparkles, Copy, ArrowLeft } from 'lucide-react';
import api from './utils/api';
import './App.css';

function scoreColor(score) {
  if (score >= 80) return { text: 'text-green-600', bar: 'bg-green-600', bg: 'bg-green-50', border: 'border-green-200' };
  if (score >= 60) return { text: 'text-yellow-600', bar: 'bg-yellow-500', bg: 'bg-yellow-50', border: 'border-yellow-200' };
  return { text: 'text-red-600', bar: 'bg-red-600', bg: 'bg-red-50', border: 'border-red-200' };
}

function priorityBadge(priority) {
  if (priority === 'high') return 'bg-red-100 text-red-700 border-red-200';
  if (priority === 'medium') return 'bg-yellow-100 text-yellow-700 border-yellow-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function App() {
  const [user, setUser] = useState(null);
  const [currentStep, setCurrentStep] = useState('login'); // login, register, upload, cvResults, jobs, dashboard
  const [loading, setLoading] = useState(false);
  const [cvs, setCvs] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [selectedJobs, setSelectedJobs] = useState({});

  // File chosen in the upload form, before it's actually submitted —
  // lets the dropzone show what's selected instead of staying static.
  const [selectedFile, setSelectedFile] = useState(null);

  // Data behind the CV Results page: parsed info + suggestions on one side,
  // a live preview of the CV on the other.
  const [cvAnalysis, setCvAnalysis] = useState(null);
  const [cvPreviewUrl, setCvPreviewUrl] = useState(null);
  const [previewType, setPreviewType] = useState(null); // 'pdf' | 'docx' | null

  // AI-tailored resume bullets + cover letter for one specific job.
  // Bullets/cover letter are editable locally — nothing here auto-submits
  // anywhere, it's a draft for the user to review and use themselves.
  const [tailoringJob, setTailoringJob] = useState(null);
  const [tailoringResult, setTailoringResult] = useState(null);
  const [tailoringBullets, setTailoringBullets] = useState([]);
  const [tailoringCoverLetter, setTailoringCoverLetter] = useState('');
  const [tailoringLoading, setTailoringLoading] = useState(false);

  const previewUrlRef = useRef(null);

  const setPreview = (url, type) => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = url;
    setCvPreviewUrl(url);
    setPreviewType(type);
  };

  const openCvResults = (analysis) => {
    setCvAnalysis(analysis);
    setCurrentStep('cvResults');
  };

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

  // File picked in the upload dropzone (before submit)
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
  };

  // Upload CV
  const handleCVUpload = async (e) => {
    e.preventDefault();

    if (!selectedFile) {
      alert('Please select a file');
      return;
    }

    setLoading(true);

    try {
      const uploadFormData = new FormData();
      uploadFormData.append('file', selectedFile);

      const response = await api.post('/cvs/upload', uploadFormData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // We already have the raw file client-side, so preview it directly
      // instead of round-tripping to the server for it.
      const objectUrl = URL.createObjectURL(selectedFile);
      setPreview(objectUrl, selectedFile.type === 'application/pdf' ? 'pdf' : 'docx');

      openCvResults({
        cvId: response.data.cvId,
        atsScore: response.data.atsScore,
        parsedCV: response.data.parsedCV,
        suggestions: response.data.suggestions.map((s, i) => ({
          id: i,
          title: s.title,
          priority: s.priority,
          impact: s.impact,
        })),
        fileName: selectedFile.name,
      });

      setSelectedFile(null);
      fetchCVs();
    } catch (error) {
      alert('Upload failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  // View a previously uploaded CV's analysis + preview
  const handleViewCv = async (cv) => {
    setLoading(true);

    try {
      const [analysisRes, fileRes] = await Promise.all([
        api.get(`/cvs/${cv.id}/analysis`),
        api.get(`/cvs/${cv.id}/file`, { responseType: 'blob' }),
      ]);

      const { cv: cvRow, suggestions } = analysisRes.data;
      const objectUrl = URL.createObjectURL(fileRes.data);
      setPreview(objectUrl, fileRes.data.type === 'application/pdf' ? 'pdf' : 'docx');

      openCvResults({
        cvId: cvRow.id,
        atsScore: cvRow.ats_score,
        parsedCV: cvRow.parsed_content,
        suggestions: suggestions.map((s) => ({
          id: s.id,
          title: s.suggestion_text,
          priority: s.priority,
          impact: s.impact_on_score,
        })),
        fileName: cvRow.file_name,
      });
    } catch (error) {
      alert('Failed to load CV: ' + (error.response?.data?.error || error.message));
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
    if (!cvAnalysis && cvs.length === 0) {
      alert('Please upload a CV first');
      return;
    }

    setLoading(true);

    try {
      const response = await api.post('/applications', {
        jobIds,
        cvId: cvAnalysis?.cvId || cvs[0].id,
      });

      alert(`Applied to ${jobIds.length} jobs successfully!\n${response.data.applicationsRemaining} applications remaining today`);
      setCurrentStep('dashboard');
      setSelectedJobs({});
    } catch (error) {
      alert('Application failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  // Generate (or reopen) an AI-tailored resume + cover letter for one job.
  // Draft only — the user reviews/edits before using it anywhere.
  const handleTailorJob = async (job, force = false) => {
    const cvId = cvAnalysis?.cvId || cvs[0]?.id;
    if (!cvId) {
      alert('Please upload a CV first');
      return;
    }

    // Client-side check purely for instant feedback — the server enforces
    // this for real, since subscriptionType here can be stale until the
    // user's next login.
    if (user?.subscriptionType !== 'premium') {
      alert('🔒 CV tailoring and cover letter generation is a premium feature. Upgrade to unlock it.');
      return;
    }

    setTailoringLoading(true);
    setTailoringJob(job);
    setCurrentStep('tailoring');

    try {
      const response = await api.post('/tailoring', { cvId, jobId: job.id, force });
      setTailoringResult(response.data);
      setTailoringBullets(response.data.tailoredBullets || []);
      setTailoringCoverLetter(response.data.coverLetter || '');
    } catch (error) {
      if (error.response?.status === 402) {
        alert('🔒 ' + error.response.data.error);
      } else {
        alert('Tailoring failed: ' + (error.response?.data?.error || error.message));
      }
      setCurrentStep('jobs');
    } finally {
      setTailoringLoading(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      alert('Could not copy to clipboard — select and copy the text manually.');
    }
  };

  // Logout
  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    setPreview(null, null);
    setUser(null);
    setCvs([]);
    setJobs([]);
    setSelectedJobs({});
    setCvAnalysis(null);
    setSelectedFile(null);
    setTailoringJob(null);
    setTailoringResult(null);
    setTailoringBullets([]);
    setTailoringCoverLetter('');
    setCurrentStep('login');
  };

  // Shared "Your CVs" list — shows upload status at a glance, with a way
  // to reopen each CV's analysis + preview.
  const CvList = () => (
    <div className="bg-white rounded-lg shadow-lg p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Your CVs</h2>
      {cvs.length === 0 ? (
        <p className="text-gray-500 text-sm">No CVs uploaded yet.</p>
      ) : (
        cvs.map(cv => (
          <div key={cv.id} className="p-4 border border-gray-200 rounded-lg mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-gray-900">{cv.file_name}</p>
                <p className="text-sm text-gray-600">Uploaded &middot; ATS Score: {cv.ats_score}/100</p>
              </div>
            </div>
            <button
              onClick={() => handleViewCv(cv)}
              disabled={loading}
              className="flex items-center gap-1 text-blue-600 font-semibold text-sm hover:underline disabled:text-gray-400"
            >
              <Eye size={16} /> View
            </button>
          </div>
        ))
      )}
    </div>
  );

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
            <div className={`border-2 border-dashed rounded-lg p-8 text-center transition ${
              selectedFile ? 'border-green-400 bg-green-50' : 'border-blue-300 hover:bg-blue-50'
            }`}>
              <input
                type="file"
                name="file"
                accept=".pdf,.docx"
                required
                className="hidden"
                id="fileInput"
                onChange={handleFileSelect}
              />
              <label htmlFor="fileInput" className="cursor-pointer block">
                {selectedFile ? (
                  <>
                    <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-3" />
                    <p className="font-semibold text-gray-900 mb-1">{selectedFile.name}</p>
                    <p className="text-sm text-gray-500">
                      {(selectedFile.size / 1024).toFixed(0)} KB &middot; ready to upload &middot; click to change
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="w-12 h-12 text-blue-600 mx-auto mb-3" />
                    <p className="font-semibold text-gray-900 mb-1">Click to upload</p>
                    <p className="text-sm text-gray-500">PDF or DOCX</p>
                  </>
                )}
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !selectedFile}
              className="w-full mt-6 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center"
            >
              {loading ? 'Uploading...' : 'Upload CV'} <ArrowRight className="ml-2 w-5 h-5" />
            </button>
          </form>

          <div className="mt-8">
            <CvList />
          </div>
        </div>
      </div>
    );
  }

  // CV Results Step — parsed info + suggestions on one side, live preview on the other
  if (currentStep === 'cvResults' && user && cvAnalysis) {
    const { atsScore, parsedCV, suggestions, fileName } = cvAnalysis;
    const colors = scoreColor(atsScore);

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">CV Analysis</h1>
              <p className="text-gray-600">{fileName}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setCurrentStep('upload');
                }}
                className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50"
              >
                Upload Another
              </button>
              <button
                onClick={() => {
                  fetchJobs(cvAnalysis.cvId);
                  setCurrentStep('jobs');
                }}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                Find Matching Jobs <ArrowRight size={18} />
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: parsed info + suggestions */}
            <div className="space-y-6">
              <div className={`bg-white rounded-lg shadow-lg p-6 border ${colors.border}`}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-bold text-gray-900">ATS Score</h2>
                  <span className={`text-3xl font-bold ${colors.text}`}>{atsScore}/100</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full ${colors.bar}`}
                    style={{ width: `${Math.min(100, atsScore)}%` }}
                  />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Parsed Information</h2>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-gray-700">
                    <User size={18} className="text-gray-400 flex-shrink-0" />
                    <span>{parsedCV.fullName || 'Not found'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-700">
                    <Mail size={18} className="text-gray-400 flex-shrink-0" />
                    <span>{parsedCV.email || 'Not found'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-700">
                    <Phone size={18} className="text-gray-400 flex-shrink-0" />
                    <span>{parsedCV.phone || 'Not found'}</span>
                  </div>
                </div>

                {parsedCV.skills && parsedCV.skills.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-gray-600 mb-2">Skills</p>
                    <div className="flex flex-wrap gap-2">
                      {parsedCV.skills.map((skill) => (
                        <span key={skill} className="bg-blue-100 text-blue-700 text-sm px-3 py-1 rounded-full">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Suggestions</h2>
                {suggestions.length === 0 ? (
                  <p className="text-gray-500 text-sm">No suggestions — looking good!</p>
                ) : (
                  <div className="space-y-3">
                    {suggestions.map((s) => (
                      <div key={s.id} className={`border rounded-lg p-3 ${priorityBadge(s.priority)}`}>
                        <div className="flex items-start gap-2">
                          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold">{s.title}</p>
                            <p className="text-xs opacity-80">+{s.impact} pts &middot; {s.priority} priority</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: CV preview */}
            <div className="bg-white rounded-lg shadow-lg p-6 flex flex-col">
              <h2 className="text-lg font-bold text-gray-900 mb-4">CV Preview</h2>
              {previewType === 'pdf' && cvPreviewUrl ? (
                <iframe
                  src={cvPreviewUrl}
                  title="CV Preview"
                  className="w-full flex-1 rounded-lg border border-gray-200 min-h-[600px]"
                />
              ) : (
                <div className="flex-1 min-h-[600px] flex flex-col items-center justify-center border border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <FileText className="w-16 h-16 text-gray-300 mb-4" />
                  <p className="font-semibold text-gray-700 mb-1">{fileName}</p>
                  <p className="text-sm text-gray-500 mb-4">
                    Inline preview isn't available for Word documents.
                  </p>
                  {cvPreviewUrl && (
                    <a
                      href={cvPreviewUrl}
                      download={fileName}
                      className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                    >
                      <Download size={18} /> Download to view
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
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
              <p className="text-gray-600">
                Today's picks: {jobs.length} job{jobs.length !== 1 ? 's' : ''} matching your profile
                <span className="text-gray-400"> &middot; free tier: 5 new vacancies/day</span>
              </p>
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
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{job.title}</h3>
                        <p className="text-gray-600">{job.company}</p>
                        <p className="text-sm text-gray-500">{job.location}</p>
                      </div>
                      {job.source && (
                        <span className="text-xs uppercase tracking-wide bg-gray-100 text-gray-600 px-2 py-1 rounded">
                          {job.source}
                        </span>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-4 flex-wrap">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600">{job.matchScore}%</div>
                        <div className="text-xs text-gray-600">Match</div>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">${job.salaryMin?.toLocaleString()}</div>
                        <div className="text-xs text-gray-600">to ${job.salaryMax?.toLocaleString()}</div>
                      </div>
                      <button
                        onClick={() => handleTailorJob(job)}
                        className="ml-auto flex items-center gap-1 bg-purple-100 text-purple-700 font-semibold text-sm px-3 py-1.5 rounded-lg hover:bg-purple-200"
                      >
                        <Sparkles size={14} /> Tailor CV & Cover Letter
                        {user?.subscriptionType !== 'premium' && (
                          <span className="ml-1 bg-purple-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase">
                            Premium
                          </span>
                        )}
                      </button>
                      {job.jobUrl && (
                        <a
                          href={job.jobUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-blue-600 font-semibold text-sm hover:underline"
                        >
                          View job posting <ArrowRight size={14} />
                        </a>
                      )}
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

  // CV Tailoring Step — AI-drafted resume bullets + cover letter for one
  // job. Everything here is editable; nothing submits anywhere on its own.
  if (currentStep === 'tailoring' && user) {
    const updateBullet = (index, value) => {
      const next = [...tailoringBullets];
      next[index] = { ...next[index], tailored: value };
      setTailoringBullets(next);
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
            <div>
              <button
                onClick={() => setCurrentStep('jobs')}
                className="flex items-center gap-1 text-gray-600 text-sm hover:underline mb-2"
              >
                <ArrowLeft size={14} /> Back to jobs
              </button>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                <Sparkles className="text-purple-600" size={28} /> Tailored for {tailoringJob?.title}
              </h1>
              <p className="text-gray-600">{tailoringJob?.company}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
            >
              <LogOut size={18} />
            </button>
          </div>

          {tailoringLoading ? (
            <div className="bg-white rounded-lg shadow-lg p-12 text-center text-gray-500">
              Generating tailored suggestions — this can take a few seconds...
            </div>
          ) : tailoringResult ? (
            <div className="space-y-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
                This is an AI-generated draft based on your CV — review, edit, and verify everything before using it.
                Nothing here is submitted anywhere automatically.
              </div>

              {tailoringResult.tailoredSummary && (
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-3">Tailored Summary</h2>
                  <p className="text-gray-700">{tailoringResult.tailoredSummary}</p>
                </div>
              )}

              {tailoringResult.keywordsToAdd?.length > 0 && (
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-3">Keywords Worth Adding</h2>
                  <div className="flex flex-wrap gap-2">
                    {tailoringResult.keywordsToAdd.map((kw) => (
                      <span key={kw} className="bg-purple-100 text-purple-700 text-sm px-3 py-1 rounded-full">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {tailoringBullets.length > 0 && (
                <div className="bg-white rounded-lg shadow-lg p-6">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Tailored Resume Bullets</h2>
                  <div className="space-y-4">
                    {tailoringBullets.map((bullet, i) => (
                      <div key={i} className="border border-gray-200 rounded-lg p-4">
                        <p className="text-xs text-gray-500 mb-1">Original</p>
                        <p className="text-sm text-gray-500 italic mb-3">{bullet.original}</p>
                        <p className="text-xs text-gray-500 mb-1">Tailored (edit as needed)</p>
                        <textarea
                          value={bullet.tailored}
                          onChange={(e) => updateBullet(i, e.target.value)}
                          rows={2}
                          className="w-full border border-gray-300 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex justify-between items-center mb-3">
                  <h2 className="text-lg font-bold text-gray-900">Cover Letter</h2>
                  <button
                    onClick={() => copyToClipboard(tailoringCoverLetter)}
                    className="flex items-center gap-1 text-blue-600 font-semibold text-sm hover:underline"
                  >
                    <Copy size={14} /> Copy
                  </button>
                </div>
                <textarea
                  value={tailoringCoverLetter}
                  onChange={(e) => setTailoringCoverLetter(e.target.value)}
                  rows={12}
                  className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <button
                onClick={() => handleTailorJob(tailoringJob, true)}
                className="text-sm text-gray-500 hover:underline"
              >
                Regenerate (calls the AI again)
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-lg p-12 text-center text-gray-500">
              Something went wrong loading this tailoring result.
            </div>
          )}
        </div>
      </div>
    );
  }

  // Dashboard
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
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
              <p className="text-xs text-gray-500 mt-1">5 vacancies/day &middot; 5 applications/day</p>
            </div>
          </div>

          <button
            onClick={() => setCurrentStep('upload')}
            className="mt-8 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
          >
            Upload New CV
          </button>
        </div>

        <CvList />
      </div>
    </div>
  );
}

export default App;
