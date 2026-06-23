import React, { useEffect, useState, useRef, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, MoreHorizontal, Handshake, AlertTriangle } from 'lucide-react';
import $ from 'jquery';
import './SignIn.css';
import { AuthContext } from '../context/AuthContext';
import { api } from '../api';
import { generateMasterKey, encryptMasterKey, deriveKeyFromPassword, decryptMasterKey, bufferToBase64, base64ToBuffer } from '../utils/cryptoUtils';


const CustomSelect = ({ options, value, onChange, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [containerRef]);

    const handleSelect = (option) => {
        onChange(option);
        setIsOpen(false);
    };

    return (
        <div className="custom-select-container" ref={containerRef}>
            <div className={`custom-select-trigger ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(!isOpen)}>
                <span>{value || placeholder}</span>
                <i className="arrow"></i>
            </div>
            {isOpen && (
                <div className="custom-select-dropdown">
                    {options.map((option, index) => (
                        <div 
                            key={index} 
                            className={`custom-select-option ${value === option ? 'selected' : ''}`}
                            onClick={() => handleSelect(option)}
                        >
                            {option}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const SignIn = () => {
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);

  useEffect(() => {
    $('body').addClass('signin-theme');
    $('body').removeClass('mashcloud-theme');

    return () => {
      $('body').removeClass('signin-theme');
    };
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState(1); 
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState(''); 
  
  const [isRegistering, setIsRegistering] = useState(false);
  const [regStep, setRegStep] = useState(1); // 1 = Info/Captcha, 2 = OTP
  const [captchaData, setCaptchaData] = useState({ id: '', svg: '' });
  const [regErrorMsg, setRegErrorMsg] = useState('');
  
  const [regData, setRegData] = useState({
      firstName: '',
      lastName: '',
      country: '+1 (United States)',
      month: 'Month',
      day: 'Day',
      year: 'Year',
      email: '',
      password: '',
      confirmPassword: '',
      phone: '',
      captchaText: '',
      announcements: true,
      appsMusic: true
  });
  
  const [otpSessionId, setOtpSessionId] = useState('');
  const [otpCode, setOtpCode] = useState('');

  const [verifyWith, setVerifyWith] = useState('email');
  
  const fetchCaptcha = async () => {
      try {
          const res = await api('/api/auth/captcha');
          const data = await res.json();
          if(data.id) {
              setCaptchaData(data);
          }
      } catch (err) {
          console.error('Failed to fetch captcha', err);
      }
  };

  useEffect(() => {
      if (isRegistering && regStep === 1) {
          fetchCaptcha();
      }
  }, [isRegistering, regStep]);

  const handleContinue = async () => {
      setErrorMsg('');
      setSuccessMsg('');
      if (step === 1 && email) {
          setStep(2);
      } else if (step === 2 && password) {
          try {
              const res = await api('/api/auth/login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email, password })
              });
              const data = await res.json();
              if (res.ok) {
                  // Handle Master Key Decryption
                  try {
                      if (data.user.encrypted_master_key) {
                          const [ivB64, encryptedMkB64] = data.user.encrypted_master_key.split(':');
                          const saltBuffer = new TextEncoder().encode(email.toLowerCase() + "MASHCLOUD");
                          const kek = await deriveKeyFromPassword(password, saltBuffer);
                          const ivBuffer = base64ToBuffer(ivB64);
                          const encryptedMkBuffer = base64ToBuffer(encryptedMkB64);
                          const masterKey = await decryptMasterKey(encryptedMkBuffer, ivBuffer, kek);
                          
                          // Export and store in sessionStorage
                          const rawMk = await crypto.subtle.exportKey('raw', masterKey);
                          sessionStorage.setItem('mashcloud_mk', bufferToBase64(rawMk));
                      }
                  } catch (err) {
                      console.error("Failed to decrypt master key", err);
                      // Don't fail login completely, but files won't be decryptable
                  }

                  setSuccessMsg('Login successful! Welcome back.');
                  login(data.user);
                  setTimeout(() => {
                      navigate('/dashboard');
                  }, 1000);
              } else {
                  setErrorMsg(data.error || 'Login failed');
              }
          } catch (e) {
              setErrorMsg('Error connecting to server.');
          }
      }
  };

  const handleRegisterStep1 = async () => {
      setRegErrorMsg('');
      if (regData.password !== regData.confirmPassword) {
          setRegErrorMsg('Passwords do not match');
          return;
      }
      try {
          // Generate Key Escrow Material
          const mk = await generateMasterKey();
          const saltBuffer = new TextEncoder().encode(regData.email.toLowerCase() + "MASHCLOUD");
          const kek = await deriveKeyFromPassword(regData.password, saltBuffer);
          const { encryptedMasterKey, iv } = await encryptMasterKey(mk, kek);
          const finalPayload = `${bufferToBase64(iv)}:${bufferToBase64(encryptedMasterKey)}`;
          
          const rawMkBuffer = await crypto.subtle.exportKey('raw', mk);
          const rawMasterKeyB64 = bufferToBase64(rawMkBuffer);

          const res = await api('/api/auth/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  ...regData,
                  captchaId: captchaData.id,
                  encryptedMasterKey: finalPayload,
                  rawMasterKeyB64: rawMasterKeyB64
              })
          });
          const data = await res.json();
          if (res.ok && data.status === 'requires_otp') {
              setOtpSessionId(data.otpSessionId);
              setRegStep(2);
          } else {
              setRegErrorMsg(data.error || 'Registration failed');
              if (data.error === 'Invalid CAPTCHA') {
                  fetchCaptcha(); // Refresh on fail
              }
          }
      } catch (e) {
          setRegErrorMsg('Error connecting to server.');
      }
  };

  const handleVerifyOtp = async () => {
      setRegErrorMsg('');
      try {
          const res = await api('/api/auth/verify-otp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ otpSessionId, otpCode })
          });
          const data = await res.json();
          if (res.ok) {
              setIsRegistering(false);
              setEmail(regData.email);
              setRegStep(1); // reset
              setSuccessMsg('Account created successfully! You can now sign in.');
          } else {
              setRegErrorMsg(data.error || 'Verification failed');
          }
      } catch (e) {
          setRegErrorMsg('Error connecting to server.');
      }
  };

  // Generate Dropdown Options
  const months = ['Month', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const days = ['Day', ...Array.from({length: 31}, (_, i) => String(i + 1))];
  const currentYear = new Date().getFullYear();
  const years = ['Year', ...Array.from({length: 120}, (_, i) => String(currentYear - i))];

  return (
    <div className="signin-page">
      <nav className="signin-nav">
        <div className="nav-left">
          <Cloud className="mashcloud-icon-small" size={20} />
          <span className="mashcloud-text">Mashcloud</span>
        </div>
        <div className="nav-right">
          <button className="menu-btn"><MoreHorizontal size={20} /></button>
        </div>
      </nav>

      <main className="signin-main">
        <div className="signin-card">
          <div className="graphic-container">
            <div className="mashcloud-halo">
              {[...Array(36)].map((_, i) => (
                <div key={i} className={`halo-dot dot-${i}`} style={{
                  transform: `rotate(${i * 10}deg) translateY(-40px)`
                }}></div>
              ))}
              {[...Array(24)].map((_, i) => (
                <div key={`inner-${i}`} className={`halo-dot-inner dot-inner-${i}`} style={{
                  transform: `rotate(${i * 15}deg) translateY(-25px)`
                }}></div>
              ))}
              <Cloud className="center-mashcloud" size={40} color="#fff" />
            </div>
          </div>
          
          <h1 className="signin-title">Sign in with Mashcloud Account</h1>
          
          {errorMsg && <div className="ui-error-msg">{errorMsg}</div>}
          {successMsg && <div className="ui-success-msg">{successMsg}</div>}
          
          <div className="input-group">
            {step === 1 ? (
              <input 
                type="text" 
                placeholder="Email or Phone Number" 
                className="signin-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
              />
            ) : (
              <div className="stacked-input-group">
                <div className="stacked-input-top">
                  <div className="stacked-label">Email or Phone Number</div>
                  <div className="stacked-value">{email}</div>
                </div>
                <div className="stacked-input-bottom">
                  <input 
                    type="password" 
                    placeholder="Password"
                    className="stacked-password-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleContinue()}
                    autoFocus
                  />
                </div>
              </div>
            )}
          </div>
          
          {step === 2 && (
            <div className="signin-options">
              <label className="keep-signed-in">
                <input type="checkbox" /> Keep me signed in
              </label>
              <a href="#" className="forgot-password" onClick={(e) => { e.preventDefault(); navigate('/forgot-password'); }}>Forgot password? &nearr;</a>
            </div>
          )}

          {step === 1 && (
            <>
              <div className="create-account">
                <a href="#" onClick={(e) => { e.preventDefault(); setIsRegistering(true); setRegStep(1); }}>Create Your Mashcloud Account</a>
              </div>

              <div className="privacy-disclaimer">
                <Handshake className="privacy-icon" size={28} color="#0a84ff" />
                <p>
                  Your Mashcloud Account information is used to allow you to sign in securely and access
                  your data. Mashcloud records certain data for security, support, and reporting
                  purposes. If you agree, Mashcloud may also use your Mashcloud Account information to
                  send you marketing emails and communications, including based on your use of
                  Mashcloud services. <a href="#">See how your data is managed...</a>
                </p>
              </div>
            </>
          )}

          <div className="action-buttons">
            {step === 1 ? (
                <button 
                  className={`btn-continue ${email ? 'active' : ''}`}
                  onClick={handleContinue}
                >
                  Continue
                </button>
            ) : (
                <div className="step2-buttons">
                    <button className="btn-signin active" onClick={handleContinue}>Sign In</button>
                </div>
            )}
          </div>
        </div>
      </main>

      {/* Registration Modal Overlay */}
      {isRegistering && (
        <div className="modal-overlay">
            <div className="modal-content">
                {regStep === 1 ? (
                    <>
                    <div className="modal-header">
                        <Cloud size={48} color="var(--accent-primary)" style={{margin: '0 auto var(--space-md)', display: 'block'}} />
                        <h2 style={{margin: 0, textAlign: 'center', fontWeight: 700, letterSpacing: '-0.03em'}}>Create Your Mashcloud Account</h2>
                        <p style={{textAlign: 'center', color: 'var(--text-secondary)', fontSize: '14px', marginTop: 'var(--space-xs)', lineHeight: 1.5}}>
                            One Mashcloud Account is all you need to access all Mashcloud services.<br/>
                            Already have a Mashcloud Account? <a href="#" onClick={(e) => { e.preventDefault(); setIsRegistering(false); }} style={{color: 'var(--accent-primary)', textDecoration: 'none', fontWeight: 600}}>Sign In &nearr;</a>
                        </p>
                    </div>
                    
                    <div className="modal-body">
                        {regErrorMsg && <div className="ui-error-msg">{regErrorMsg}</div>}
                        
                        <div className="form-row">
                            <input type="text" className="signin-input" placeholder="First Name" 
                                value={regData.firstName} onChange={(e)=>setRegData({...regData, firstName: e.target.value})} />
                            <input type="text" className="signin-input" placeholder="Last Name" 
                                value={regData.lastName} onChange={(e)=>setRegData({...regData, lastName: e.target.value})} />
                        </div>
                        
                        <div className="form-group" style={{marginTop: 'var(--space-md)'}}>
                            <label style={{fontSize: '14px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-xs)', fontWeight: 600}}>
                                Birthday
                            </label>
                            <div className="form-row">
                                <CustomSelect 
                                    options={months} 
                                    value={regData.month} 
                                    onChange={(val) => setRegData({...regData, month: val})} 
                                />
                                <CustomSelect 
                                    options={days} 
                                    value={regData.day} 
                                    onChange={(val) => setRegData({...regData, day: val})} 
                                />
                                <CustomSelect 
                                    options={years} 
                                    value={regData.year} 
                                    onChange={(val) => setRegData({...regData, year: val})} 
                                />
                            </div>
                        </div>

                        <div className="form-group" style={{marginTop: 'var(--space-lg)'}}>
                            <input type="email" className="signin-input" placeholder="name@example.com" 
                                value={regData.email} onChange={(e)=>setRegData({...regData, email: e.target.value})} />
                        </div>
                        
                        <div className="form-group" style={{marginTop: 'var(--space-sm)'}}>
                            <input type="password" className="signin-input" placeholder="Password" 
                                value={regData.password} onChange={(e)=>setRegData({...regData, password: e.target.value})} />
                        </div>

                        <div className="form-group" style={{marginTop: 'var(--space-sm)'}}>
                            <input type="password" className="signin-input" placeholder="Confirm Password" 
                                value={regData.confirmPassword} onChange={(e)=>setRegData({...regData, confirmPassword: e.target.value})} />
                        </div>

                        <hr className="divider" />

                        <div className="form-group">
                            <label style={{fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 'var(--space-xxs)'}}>Country Options</label>
                            <CustomSelect 
                                options={['+1 (United States)', '+44 (United Kingdom)', '+91 (India)']} 
                                value={regData.country} 
                                onChange={(val) => setRegData({...regData, country: val})} 
                            />
                        </div>

                        <div className="form-group" style={{marginTop: 'var(--space-sm)'}}>
                            <input type="text" className="signin-input" placeholder="Phone Number" 
                                value={regData.phone} onChange={(e)=>setRegData({...regData, phone: e.target.value})} />
                        </div>
                        <p style={{fontSize: '13px', color: 'var(--text-secondary)', marginTop: 'var(--space-xs)', lineHeight: 1.5}}>
                            Enter a phone number where you can receive verification codes via text or a phone call when signing in.
                        </p>
                        
                        <div style={{marginTop: '16px'}}>
                            <p style={{fontSize: '13px', color: '#fff', marginBottom: '8px', fontWeight: 500}}>Verify with:</p>
                            <label style={{display: 'flex', alignItems: 'center', gap: '8px', color: '#f5f5f7', fontSize: '14px', marginBottom: '8px'}}>
                                <input type="radio" name="verifyWith" checked={verifyWith === 'email'} onChange={() => setVerifyWith('email')} /> Email
                            </label>
                            <label style={{display: 'flex', alignItems: 'center', gap: '8px', color: '#f5f5f7', fontSize: '14px', marginBottom: '8px'}}>
                                <input type="radio" name="verifyWith" checked={verifyWith === 'text'} onChange={() => setVerifyWith('text')} /> Text message
                            </label>
                            <label style={{display: 'flex', alignItems: 'center', gap: '8px', color: '#f5f5f7', fontSize: '14px'}}>
                                <input type="radio" name="verifyWith" checked={verifyWith === 'call'} onChange={() => setVerifyWith('call')} /> Phone call
                            </label>
                        </div>

                        <hr className="divider" />

                        <div className="checkbox-group">
                            <label className="custom-checkbox">
                                <input type="checkbox" checked={regData.announcements} onChange={(e) => setRegData({...regData, announcements: e.target.checked})} />
                                <div className="checkbox-text">
                                    <strong>Announcements</strong>
                                    <span>Receive Mashcloud emails and communications including announcements, marketing, recommendations, and updates about Mashcloud products, services and software.</span>
                                </div>
                            </label>
                            
                            <label className="custom-checkbox">
                                <input type="checkbox" checked={regData.appsMusic} onChange={(e) => setRegData({...regData, appsMusic: e.target.checked})} />
                                <div className="checkbox-text">
                                    <strong>Apps, Music, TV, and More</strong>
                                    <span>Receive Mashcloud emails and communications including new releases, exclusive content, special offers, and marketing and recommendations for apps, music, movies, TV, books, podcasts, Mashcloud Pay, Mashcloud Card and more.</span>
                                </div>
                            </label>
                        </div>

                        <hr className="divider" />

                        <div className="captcha-section">
                            <div className="captcha-box">
                                {captchaData.svg ? (
                                    <div className="captcha-svg-container" dangerouslySetInnerHTML={{__html: captchaData.svg}}></div>
                                ) : (
                                    <div style={{display:'flex', alignItems:'center', justifyContent:'center', height:'50px'}}>
                                        <AlertTriangle color="#ff3b30" />
                                    </div>
                                )}
                            </div>
                            <div className="captcha-input-wrapper">
                                <input type="text" className="captcha-input" placeholder="Type the characters in the image" 
                                    value={regData.captchaText} onChange={(e)=>setRegData({...regData, captchaText: e.target.value})} />
                            </div>
                            {!captchaData.svg && <p className="captcha-error">Unable to retrieve captcha at this time.</p>}
                            <div className="captcha-actions">
                                <a href="#" onClick={(e) => { e.preventDefault(); fetchCaptcha(); }}>New Code</a>
                                <a href="#">Vision Impaired</a>
                            </div>
                        </div>
                        
                        <div className="privacy-disclaimer" style={{marginTop: '24px'}}>
                            <Handshake className="privacy-icon" size={28} color="#0a84ff" />
                            <p>
                                Your Mashcloud Account information is used to allow you to sign in securely and access
                                your data. Mashcloud records certain data for security, support and reporting purposes. If you
                                agree, Mashcloud may also use your Mashcloud Account information to send you marketing emails
                                and communications, including based on your use of Mashcloud services. <a href="#">See how your data is managed.</a>
                            </p>
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button className="btn-modal-cancel" onClick={() => setIsRegistering(false)}>Cancel</button>
                        <button className="btn-modal-continue" onClick={handleRegisterStep1}>Continue</button>
                    </div>
                    </>
                ) : (
                    <>
                    <div className="modal-header">
                        <Cloud size={32} color="#fff" style={{margin: '0 auto 16px', display: 'block'}} />
                        <h2 style={{margin: 0, textAlign: 'center', fontWeight: 600}}>Verify Your Number</h2>
                        <p style={{textAlign: 'center', color: '#a1a1a6', fontSize: '13px', marginTop: '8px', lineHeight: 1.4}}>
                            Enter the verification code sent to {verifyWith === 'email' ? regData.email : regData.phone}
                        </p>
                    </div>
                    <div className="modal-body">
                        {regErrorMsg && <div className="ui-error-msg" style={{marginBottom: '16px'}}>{regErrorMsg}</div>}
                        <input type="text" className="signin-input" placeholder="6-digit code" 
                            style={{textAlign: 'center', fontSize: '24px', letterSpacing: '4px'}}
                            value={otpCode} onChange={(e)=>setOtpCode(e.target.value)} />
                    </div>
                    <div className="modal-footer">
                        <button className="btn-modal-cancel" onClick={() => setRegStep(1)}>Back</button>
                        <button className="btn-modal-continue" onClick={handleVerifyOtp}>Verify & Complete</button>
                    </div>
                    </>
                )}
            </div>
        </div>
      )}
    </div>
  );
};

export default SignIn;
