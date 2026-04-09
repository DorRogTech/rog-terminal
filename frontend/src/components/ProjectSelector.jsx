import React, { useState, useEffect } from 'react';
import wsClient from '../utils/websocket';

export default function ProjectSelector({ onClose }) {
  const [projects, setProjects] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = wsClient.on('projects_list', (data) => {
      setProjects(data.projects || []);
      setCurrent(data.current);
      setLoading(false);
    });

    const unsubSelected = wsClient.on('project_selected', (data) => {
      setCurrent(data.path);
    });

    wsClient.send({ type: 'list_projects' });

    return () => { unsub(); unsubSelected(); };
  }, []);

  function selectProject(project) {
    wsClient.send({ type: 'select_project', path: project.path });
    setCurrent(project.path);
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
        <div className="modal-header">
          <h2 className="modal-title">Select Project</h2>
          <button className="btn-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body" style={{ padding: '8px 16px' }}>
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading projects...
            </div>
          ) : projects.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', direction: 'rtl' }}>
              Agent לא מחובר. הפעל את ה-Agent במחשב כדי לגשת לפרויקטים.
            </div>
          ) : (
            projects.map((p) => (
              <div
                key={p.path}
                className={`project-item ${current === p.path ? 'active' : ''}`}
                onClick={() => selectProject(p)}
              >
                <div className="project-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div className="project-info">
                  <div className="project-name">{p.name}</div>
                  <div className="project-path" dir="ltr">{p.path}</div>
                </div>
                {current === p.path && (
                  <span className="connection-badge connected" style={{ flexShrink: 0 }}>Active</span>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
