import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import $ from 'jquery';
import Toast from './Toast';

const MashcloudHome = () => {
    const [toast, setToast] = useState(null);
    const heroRef = useRef(null);
    const cardLeftRef = useRef(null);
    const cardRightRef = useRef(null);
    const bgRef = useRef(null);
    const navigate = useNavigate();

    const showToast = (message, type = 'info') => {
        setToast({ message, type });
    };

    useEffect(() => {
        // GSAP Animations
        const tl = gsap.timeline();
        tl.fromTo(heroRef.current?.children || [], 
            { y: 50, opacity: 0 }, 
            { y: 0, opacity: 1, duration: 0.8, stagger: 0.15, ease: "power3.out" }
        )
        .fromTo([cardLeftRef.current, cardRightRef.current],
            { y: 50, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8, stagger: 0.2, ease: "power3.out" },
            "-=0.4"
        );

        // Theme and Three.js background
        $('body').addClass('mashcloud-theme');
        $('body').removeClass('signin-theme');
        
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        
        renderer.setSize(window.innerWidth, window.innerHeight);
        if(bgRef.current) {
            bgRef.current.appendChild(renderer.domElement);
        }

        const geometry = new THREE.BufferGeometry();
        const particlesCount = 2000;
        const posArray = new Float32Array(particlesCount * 3);
        for(let i = 0; i < particlesCount * 3; i++) {
            posArray[i] = (Math.random() - 0.5) * 10;
        }
        geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        const material = new THREE.PointsMaterial({
            size: 0.005,
            color: 0x228B22,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });
        const particlesMesh = new THREE.Points(geometry, material);
        scene.add(particlesMesh);

        camera.position.z = 2;

        let animationFrameId;
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            particlesMesh.rotation.y -= 0.001;
            particlesMesh.rotation.x -= 0.0005;
            renderer.render(scene, camera);
        };
        animate();

        const handleResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
            if(bgRef.current) {
                bgRef.current.innerHTML = '';
            }
        };
    }, []);

    return (
        <div className="app-container">
            <div className="three-bg" ref={bgRef} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: -1 }}></div>
            <div className="content-layer">
                <nav className="top-nav">
                    <div className="nav-left">
                        <img src="/logo.png" alt="Mashcloud logo" className="nav-icon" />
                        <span>Mashcloud</span>
                    </div>
                    <div className="nav-right">
                        <div className="dots" onClick={() => showToast('Coming Soon', 'info')} style={{cursor: 'pointer'}}>
                            <div className="dot"></div>
                            <div className="dot"></div>
                            <div className="dot"></div>
                        </div>
                    </div>
                </nav>

                <main className="main-content">
                    <div className="hero" ref={heroRef}>
                        <img src="/cloud.png" alt="Mashcloud Cloud" className="hero-cloud" />
                        <h1 className="hero-title">Mashcloud</h1>
                        <button className="btn-signin" onClick={() => navigate('/signin')}>Sign In</button>
                        <p className="hero-subtitle">The best place for all your<br/>photos, files, notes, mail,<br/>and more.</p>
                    </div>

                    <div className="features-grid">
                        <div className="feature-card" ref={cardLeftRef}>
                            <div className="card-content-top">
                                <div className="apps-grid">
                                    {[...Array(8)].map((_, i) => (
                                        <div key={i} className="app-icon-placeholder"></div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <h2 className="card-title">Easily access apps and data<br/>from your iPhone on the web</h2>
                                <p className="card-desc">Mashcloud is essential for keeping personal information from your devices safe, up to date, and available wherever you are. At Mashcloud.com, you can access your photos, files, and more from any web browser. Changes you make will sync to your devices, so you're always up to date.</p>
                            </div>
                        </div>

                        <div className="feature-card" ref={cardRightRef}>
                            <div className="card-content-top">
                                <div className="cloud-storage-graphic">
                                    <div className="cloud-bubble" style={{width: '90px', height: '90px', left: '15%', top: '25%'}}></div>
                                    <div className="cloud-bubble" style={{width: '130px', height: '130px', left: '35%', top: '5%'}}></div>
                                    <div className="cloud-bubble" style={{width: '70px', height: '70px', right: '25%', top: '45%'}}></div>
                                    <h2 style={{color: '#fff', fontSize: '36px', zIndex: 1, position: 'relative', textShadow: '0 2px 10px rgba(0,0,0,0.5)'}}>12TB</h2>
                                </div>
                                <h2 style={{color: '#0a84ff', textAlign: 'center', marginBottom: '20px', fontSize: '28px', fontWeight: 600}}>Mashcloud+</h2>
                            </div>
                            <div>
                                <h2 className="card-title">More storage, plus features to protect your privacy and connect with friends</h2>
                                <p className="card-desc">Upgrade to Mashcloud+ to get more storage, plan events with Mash Invites, and have peace of mind with privacy features like Mashcloud Private Relay, Hide My Email, and HomeKit Secure Video. You can even share your subscription with your family. Learn more at <a href="#" onClick={(e) => { e.preventDefault(); showToast('Coming Soon', 'info'); }}>mashcloud.com/+</a>.</p>
                            </div>
                        </div>
                    </div>
                </main>

                <footer className="footer">
                    <div className="footer-links">
                        <span onClick={() => showToast('Coming Soon', 'info')} style={{cursor: 'pointer'}}>System Status</span>
                        <span onClick={() => showToast('Coming Soon', 'info')} style={{cursor: 'pointer'}}>Privacy Policy</span>
                        <span onClick={() => showToast('Coming Soon', 'info')} style={{cursor: 'pointer'}}>Terms & Conditions</span>
                    </div>
                    <div>Copyright © 2026 Mashcloud Inc. All rights reserved.</div>
                </footer>
            </div>
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default MashcloudHome;
