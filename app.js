// EMG Dashboard Application
export default class EMGDashboard {
    constructor(front, back) {
        this.data = {
            configurations: [],
            sessions: [],
            customMetrics: []
        };
        
        
        this.electrodeTypes = [
            {"value": "bipolar", "label": "Bipolar", "description": "Two electrodes of same size for differential measurement"},
            {"value": "monopolar", "label": "Monopolar", "description": "Active electrode with reference electrode"},
            {"value": "multichannel", "label": "Multi-channel", "description": "Multiple electrode array for high-density recording"}
        ];

        this.defaultMetrics = [
            {"name": "RMS", "unit": "mV", "description": "Root Mean Square amplitude"},
            {"name": "ARV", "unit": "mV", "description": "Average Rectified Value"},
            {"name": "MNF", "unit": "Hz", "description": "Mean Frequency"},
            {"name": "MDF", "unit": "Hz", "description": "Median Frequency"},
            {"name": "SNR", "unit": "dB", "description": "Signal-to-Noise Ratio"},
            {"name": "Peak Amplitude", "unit": "mV", "description": "Maximum signal amplitude"},
            {"name": "Zero Crossings", "unit": "count", "description": "Number of zero crossings"},
            {"name": "Waveform Length", "unit": "mV", "description": "Cumulative waveform length"}
        ];
        this.bodyFront = front;
        this.bodyBack  = back;
        this.currentBodyView = 'front';
        this.selectedMuscle = null;
        
        this.init();
    }

    init() {
        this.loadData();
        this.initializeEventListeners();
        this.populateInitialData();
        this.renderBodyDiagram();
        this.updateDashboardStats();
        this.renderConfigurations();
        this.renderSessions();
        this.setupFileUploads();
    }
    getViewData(view) {
        return view === "front" ? bodyFront : bodyBack;
      }

  /*  flatten left / right / common path arrays into one <path> element  */
    buildPathElement(part) {
        const segmentList = [
          ...(part.path.common || []),
          ...(part.path.left   || []),
          ...(part.path.right  || [])
        ];
        const d = segmentList.join(" ");
    
        const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("d", d);
        p.setAttribute("fill", part.color || "#6b7280");
        p.dataset.slug = part.slug;
        p.classList.add("muscle-path");
        return p;
      }
    // Data Management
    loadData() {
        const savedData = localStorage.getItem('emgDashboardData');
        if (savedData) {
            this.data = JSON.parse(savedData);
        } else {
            // Load sample data
            this.data.configurations = [
                {
                    "id": "config1",
                    "name": "Biceps Standard Setup",
                    "electrodeType": "bipolar",
                    "muscleGroup": "biceps",
                    "specs": "Ag/AgCl, 10mm diameter, <5kΩ impedance",
                    "placement": "Muscle belly, parallel to fiber direction",
                    "dateCreated": "2025-06-15"
                }
            ];
            this.data.sessions = [
                {
                    "id": "session1",
                    "name": "Biceps Contraction Study",
                    "configuration": "config1",
                    "date": "2025-06-16",
                    "subject": "Subject001",
                    "metrics": {"RMS": 0.45, "ARV": 0.38, "MNF": 85.2, "SNR": 15.8},
                    "notes": "Initial baseline measurement"
                }
            ];
        }
    }

    saveData() {
        localStorage.setItem('emgDashboardData', JSON.stringify(this.data));
    }

    // Navigation
    initializeEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                this.navigateToPage(page);
            });
        });

        // Forms
        document.getElementById('add-config-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addConfiguration(e.target);
        });

        document.getElementById('add-session-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.addSession(e.target);
        });

        // Search and filters
        document.getElementById('config-search').addEventListener('input', (e) => {
            this.filterConfigurations();
        });

        document.getElementById('electrode-filter').addEventListener('change', (e) => {
            this.filterConfigurations();
        });

        // Modal close events
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hideModal(e.target);
            }
        });
    }

    navigateToPage(page) {
        // Update navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`[data-page="${page}"]`).classList.add('active');

        // Show page
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
        });
        document.getElementById(page).classList.add('active');

        // Update page-specific content
        if (page === 'analytics') {
            this.renderAnalytics();
        }
    }

    // Dashboard Stats
    updateDashboardStats() {
        document.getElementById('total-configs').textContent = this.data.configurations.length;
        document.getElementById('total-sessions').textContent = this.data.sessions.length;
        
        const activeMuscles = new Set(this.data.configurations.map(c => c.muscleGroup)).size;
        document.getElementById('active-muscles').textContent = activeMuscles;

        const avgSNR = this.data.sessions.length > 0 ? 
            (this.data.sessions.reduce((sum, s) => sum + (s.metrics.SNR || 0), 0) / this.data.sessions.length).toFixed(1) : 0;
        document.getElementById('avg-snr').textContent = avgSNR;

        this.renderRecentActivity();
    }
     /*  render SVG for current anterior / posterior view  */
  renderBodyDiagram() {
    const container = document.querySelector(".body-view.active");
    if (!container) return;

    /* clear old */
    container.innerHTML = "";

    /* create <svg> */
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 600 1200");   //  matches library
    svg.setAttribute("width",  "100%");
    svg.setAttribute("height", "100%");

    /* add every muscle path */
    this.getViewData(this.currentBodyView).forEach(part => {
      const pathEl = this.buildPathElement(part);
      pathEl.addEventListener("click", () => this.selectMuscle(part.slug));
      svg.appendChild(pathEl);
    });

    container.appendChild(svg);
  }

  /*  handle click  */
  /** ------------------------------------------------------------------
 *  Handle a user click on any SVG muscle-outline <path>.
 *  Keeps UI labels in sync and shows recent configs & sessions.
 * -----------------------------------------------------------------*/
selectMuscle(slug) {                                            // <─ uses SVG slug
  /* 1 – remember the current selection so other methods can read it */
  this.selectedMuscle = slug;                                   // [1]

  /* 2 – lookup display-name inside the bodyFront/bodyBack arrays  */
  const allParts  = [...bodyFront, ...bodyBack];                // [2]
  const part      = allParts.find(p => p.slug === slug);        // [2]
  const muscleName = part ? (part.name || slug) : slug;         // [3]
  document.getElementById('selected-muscle-name').textContent = muscleName;  // [1]

  /* 3 – gather related configurations & sessions -----------------*/
  const configs = this.data.configurations
    .filter(c => c.muscleGroup === slug);                       // [4]

  const sessions = this.data.sessions
    .filter(s => {
      const cfg = this.data.configurations.find(c => c.id === s.configuration); // [4]
      return cfg && cfg.muscleGroup === slug;                   // [4]
    });

  /* 4 – build the details panel ----------------------------------*/
  let html = `<h4>${muscleName}</h4>`;                          // [5]

  /* 4a: configurations block */
  if (configs.length) {                                         // [4]
    html += `
      <div class="muscle-config-info">
        <h5>Configurations (${configs.length})</h5>
        ${configs.map(c => `
          <div style="margin-bottom:8px;">
            <strong>${c.name}</strong> – ${this.electrodeTypes
              .find(e => e.value === c.electrodeType)?.label || 'Custom'}
          </div>`).join('')}
      </div>`;
  }

  /* 4b: recent sessions block */
  if (sessions.length) {                                        // [4]
    html += `
      <div class="muscle-config-info">
        <h5>Recent Sessions (${sessions.length})</h5>
        ${sessions.slice(-3).map(s => `
          <div style="margin-bottom:4px;">
            ${s.name} – ${this.formatDate(s.date)}
          </div>`).join('')}
      </div>`;
  }

  /* 4c: call-to-action button */
  html += configs.length
    ? `<button class="btn btn--primary"
               onclick="emgDashboard.navigateToPage('sessions')">
         Start New Session
       </button>`
    : `<p>No configurations found for this muscle group.</p>
       <button class="btn btn--primary"
               onclick="emgDashboard.navigateToPage('configurations')">
         Create Configuration
       </button>`;

  /* 5 – inject into the side panel */
  document.getElementById('muscle-details').innerHTML = html;   // [1]
}


  /*  details side-panel  */
  showMuscleDetails(slug) {
    const allParts = [...bodyFront, ...bodyBack];
    const part = allParts.find(p => p.slug === slug);
    const details = document.getElementById("muscle-details");

    if (!details) return;

    if (!part) {
      details.innerHTML = "<p>No muscle found.</p>";
      return;
    }

    /* existing configuration? */
    const hasConfig = this.data.configurations.some(c => c.muscleGroup === slug);

    details.innerHTML = `
      <h3>${part.slug}</h3>
      <p>${hasConfig ? "Configuration exists." : "No configuration yet."}</p>
    `;
  }
    renderRecentActivity() {
        const container = document.getElementById('recent-activity-list');
        const activities = [];

        // Add recent configurations
        this.data.configurations.slice(-3).forEach(config => {
            activities.push({
                text: `Configuration "${config.name}" created`,
                time: this.formatDate(config.dateCreated),
                type: 'config'
            });
        });

        // Add recent sessions
        this.data.sessions.slice(-3).forEach(session => {
            activities.push({
                text: `Session "${session.name}" completed`,
                time: this.formatDate(session.date),
                type: 'session'
            });
        });

        activities.sort((a, b) => new Date(b.time) - new Date(a.time));
        
        if (activities.length === 0) {
            container.innerHTML = '<div class="activity-item"><div class="activity-text">No recent activity</div></div>';
            return;
        }

        container.innerHTML = activities.slice(0, 5).map(activity => `
            <div class="activity-item">
                <div class="activity-text">${activity.text}</div>
                <div class="activity-time">${this.formatDate(activity.time)}</div>
            </div>
        `).join('');
    }

    // Configuration Management
    populateInitialData() {
        // Populate muscle group dropdown
        const muscleSelect = document.querySelector('select[name="muscleGroup"]');
        const allMuscles = [...this.bodyFront, ...this.bodyBack];
        muscleSelect.innerHTML = '<option value="">Select muscle group</option>' +
            allMuscles.map(muscle => `<option value="${muscle.id}">${muscle.name}</option>`).join('');

        // Populate configuration dropdown for sessions
        this.updateConfigurationDropdown();
    }

    updateConfigurationDropdown() {
        const configSelect = document.querySelector('select[name="configuration"]');
        configSelect.innerHTML = '<option value="">Select configuration</option>' +
            this.data.configurations.map(config => 
                `<option value="${config.id}">${config.name}</option>`
            ).join('');
    }

    addConfiguration(form) {
        const formData = new FormData(form);
        const config = {
            id: 'config_' + Date.now(),
            name: formData.get('name'),
            electrodeType: formData.get('electrodeType'),
            muscleGroup: formData.get('muscleGroup'),
            specs: formData.get('specs'),
            placement: formData.get('placement'),
            dateCreated: new Date().toISOString().split('T')[0]
        };

        this.data.configurations.push(config);
        this.saveData();
        this.renderConfigurations();
        this.updateConfigurationDropdown();
        this.updateDashboardStats();
        this.renderBodyDiagram();
        this.hideAddConfigForm();
        this.showToast('Configuration added successfully!', 'success');
        form.reset();
    }

    renderConfigurations() {
        const container = document.getElementById('configurations-list');
        if (this.data.configurations.length === 0) {
            container.innerHTML = '<div class="card"><div class="card__body"><p>No configurations found. Create your first configuration to get started.</p></div></div>';
            return;
        }

        container.innerHTML = this.data.configurations.map(config => `
            <div class="config-card" data-config-id="${config.id}">
                <div class="config-card-header">
                    <div class="config-card-title">${config.name}</div>
                    <div class="config-card-meta">Created: ${this.formatDate(config.dateCreated)}</div>
                </div>
                <div class="config-card-body">
                    <div class="config-detail">
                        <span class="config-detail-label">Electrode Type:</span>
                        <span class="config-detail-value">${this.electrodeTypes.find(e => e.value === config.electrodeType)?.label || config.electrodeType}</span>
                    </div>
                    <div class="config-detail">
                        <span class="config-detail-label">Muscle Group:</span>
                        <span class="config-detail-value">${this.getMuscleNameById(config.muscleGroup)}</span>
                    </div>
                    <div class="config-detail">
                        <span class="config-detail-label">Specifications:</span>
                        <span class="config-detail-value">${config.specs || 'Not specified'}</span>
                    </div>
                    <div class="config-detail">
                        <span class="config-detail-label">Placement:</span>
                        <span class="config-detail-value">${config.placement || 'Not specified'}</span>
                    </div>
                </div>
                <div class="config-actions">
                    <button class="btn btn--sm btn--secondary" onclick="emgDashboard.editConfiguration('${config.id}')">Edit</button>
                    <button class="btn btn--sm btn--outline" onclick="emgDashboard.deleteConfiguration('${config.id}')">Delete</button>
                </div>
            </div>
        `).join('');
    }

    filterConfigurations() {
        const searchTerm = document.getElementById('config-search').value.toLowerCase();
        const electrodeFilter = document.getElementById('electrode-filter').value;

        const filteredConfigs = this.data.configurations.filter(config => {
            const matchesSearch = config.name.toLowerCase().includes(searchTerm) ||
                                this.getMuscleNameById(config.muscleGroup).toLowerCase().includes(searchTerm);
            const matchesElectrode = !electrodeFilter || config.electrodeType === electrodeFilter;
            return matchesSearch && matchesElectrode;
        });

        this.renderFilteredConfigurations(filteredConfigs);
    }

    renderFilteredConfigurations(configs) {
        const container = document.getElementById('configurations-list');
        if (configs.length === 0) {
            container.innerHTML = '<div class="card"><div class="card__body"><p>No configurations match your search criteria.</p></div></div>';
            return;
        }

        container.innerHTML = configs.map(config => `
            <div class="config-card" data-config-id="${config.id}">
                <div class="config-card-header">
                    <div class="config-card-title">${config.name}</div>
                    <div class="config-card-meta">Created: ${this.formatDate(config.dateCreated)}</div>
                </div>
                <div class="config-card-body">
                    <div class="config-detail">
                        <span class="config-detail-label">Electrode Type:</span>
                        <span class="config-detail-value">${this.electrodeTypes.find(e => e.value === config.electrodeType)?.label || config.electrodeType}</span>
                    </div>
                    <div class="config-detail">
                        <span class="config-detail-label">Muscle Group:</span>
                        <span class="config-detail-value">${this.getMuscleNameById(config.muscleGroup)}</span>
                    </div>
                    <div class="config-detail">
                        <span class="config-detail-label">Specifications:</span>
                        <span class="config-detail-value">${config.specs || 'Not specified'}</span>
                    </div>
                    <div class="config-detail">
                        <span class="config-detail-label">Placement:</span>
                        <span class="config-detail-value">${config.placement || 'Not specified'}</span>
                    </div>
                </div>
                <div class="config-actions">
                    <button class="btn btn--sm btn--secondary" onclick="emgDashboard.editConfiguration('${config.id}')">Edit</button>
                    <button class="btn btn--sm btn--outline" onclick="emgDashboard.deleteConfiguration('${config.id}')">Delete</button>
                </div>
            </div>
        `).join('');
    }

    deleteConfiguration(configId) {
        if (confirm('Are you sure you want to delete this configuration?')) {
            this.data.configurations = this.data.configurations.filter(c => c.id !== configId);
            this.saveData();
            this.renderConfigurations();
            this.updateConfigurationDropdown();
            this.updateDashboardStats();
            this.renderBodyDiagram();
            this.showToast('Configuration deleted successfully!', 'success');
        }
    }

    



    // Session Management
    addSession(form) {
        const formData = new FormData(form);
        const session = {
            id: 'session_' + Date.now(),
            name: formData.get('name'),
            configuration: formData.get('configuration'),
            date: formData.get('date'),
            subject: formData.get('subject'),
            notes: formData.get('notes'),
            metrics: {},
            files: []
        };

        // Collect metrics
        document.querySelectorAll('.metric-input-group input').forEach(input => {
            if (input.value) {
                session.metrics[input.name] = parseFloat(input.value);
            }
        });

        this.data.sessions.push(session);
        this.saveData();
        this.renderSessions();
        this.updateDashboardStats();
        this.hideAddSessionForm();
        this.showToast('Session created successfully!', 'success');
        form.reset();
        this.resetMetricsInputs();
    }

    renderSessions() {
        const container = document.getElementById('sessions-list');
        if (this.data.sessions.length === 0) {
            container.innerHTML = '<div class="card"><div class="card__body"><p>No sessions found. Create your first session to get started.</p></div></div>';
            return;
        }

        container.innerHTML = this.data.sessions.map(session => {
            const config = this.data.configurations.find(c => c.id === session.configuration);
            const configName = config ? config.name : 'Unknown Configuration';
            
            return `
                <div class="session-card" data-session-id="${session.id}">
                    <div class="session-card-header">
                        <div class="session-card-title">${session.name}</div>
                        <div class="session-card-meta">
                            ${configName} • ${this.formatDate(session.date)} • ${session.subject}
                        </div>
                    </div>
                    <div class="session-metrics">
                        ${Object.entries(session.metrics).map(([key, value]) => `
                            <div class="metric-item">
                                <div class="metric-value">${value}</div>
                                <div class="metric-label">${key}</div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="config-actions">
                        <button class="btn btn--sm btn--secondary" onclick="emgDashboard.viewSession('${session.id}')">View Details</button>
                        <button class="btn btn--sm btn--outline" onclick="emgDashboard.deleteSession('${session.id}')">Delete</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    deleteSession(sessionId) {
        if (confirm('Are you sure you want to delete this session?')) {
            this.data.sessions = this.data.sessions.filter(s => s.id !== sessionId);
            this.saveData();
            this.renderSessions();
            this.updateDashboardStats();
            this.showToast('Session deleted successfully!', 'success');
        }
    }

    // Metrics Management
    setupMetricsInputs() {
        const container = document.getElementById('metrics-inputs');
        const allMetrics = [...this.defaultMetrics, ...this.data.customMetrics];
        
        container.innerHTML = allMetrics.map(metric => `
            <div class="metric-input-group">
                <label>${metric.name}</label>
                <input type="number" step="0.01" name="${metric.name}" placeholder="0.00">
                <span class="metric-unit">${metric.unit}</span>
                ${this.data.customMetrics.includes(metric) ? 
                    `<button type="button" class="remove-metric" onclick="emgDashboard.removeCustomMetric('${metric.name}')">&times;</button>` : 
                    ''}
            </div>
        `).join('');
    }

    addCustomMetric() {
        const name = prompt('Enter metric name:');
        if (!name) return;
        
        const unit = prompt('Enter unit (e.g., mV, Hz, dB):');
        if (!unit) return;
        
        const customMetric = { name, unit, description: 'Custom metric' };
        this.data.customMetrics.push(customMetric);
        this.saveData();
        this.setupMetricsInputs();
        this.showToast(`Custom metric "${name}" added!`, 'success');
    }

    removeCustomMetric(metricName) {
        this.data.customMetrics = this.data.customMetrics.filter(m => m.name !== metricName);
        this.saveData();
        this.setupMetricsInputs();
        this.showToast(`Custom metric "${metricName}" removed!`, 'success');
    }

    resetMetricsInputs() {
        document.querySelectorAll('.metric-input-group input').forEach(input => {
            input.value = '';
        });
    }

    // File Upload
    setupFileUploads() {
        const uploadAreas = document.querySelectorAll('.upload-area');
        uploadAreas.forEach(area => {
            const input = area.querySelector('input[type="file"]');
            
            area.addEventListener('dragover', (e) => {
                e.preventDefault();
                area.classList.add('dragover');
            });
            
            area.addEventListener('dragleave', () => {
                area.classList.remove('dragover');
            });
            
            area.addEventListener('drop', (e) => {
                e.preventDefault();
                area.classList.remove('dragover');
                const files = e.dataTransfer.files;
                this.handleFileUpload(files, area);
            });
            
            input.addEventListener('change', (e) => {
                this.handleFileUpload(e.target.files, area);
            });
        });
    }

    handleFileUpload(files, area) {
        const fileList = Array.from(files);
        const p = area.querySelector('p');
        p.innerHTML = `${fileList.length} file(s) selected: ${fileList.map(f => f.name).join(', ')}`;
    }

    // Analytics
    renderAnalytics() {
        this.renderSignalQualityChart();
        this.renderConfigurationChart();
        this.renderMuscleActivityChart();
        this.renderPerformanceSummary();
    }

    renderSignalQualityChart() {
        const canvas = document.getElementById('signal-quality-chart');
        const ctx = canvas.getContext('2d');
        
        // Simple line chart for demonstration
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        
        const data = this.data.sessions.map(s => s.metrics.SNR || 0);
        const maxVal = Math.max(...data, 20);
        
        ctx.beginPath();
        data.forEach((value, index) => {
            const x = (index / (data.length - 1)) * canvas.width;
            const y = canvas.height - (value / maxVal) * canvas.height;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        
        // Add title
        ctx.fillStyle = '#1e3a8a';
        ctx.font = '14px Arial';
        ctx.fillText('SNR Over Time', 10, 20);
    }

    renderConfigurationChart() {
        const canvas = document.getElementById('configuration-chart');
        const ctx = canvas.getContext('2d');
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const configStats = {};
        this.data.sessions.forEach(session => {
            const config = this.data.configurations.find(c => c.id === session.configuration);
            if (config) {
                configStats[config.name] = (configStats[config.name] || 0) + 1;
            }
        });
        
        const configs = Object.keys(configStats);
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
        
        configs.forEach((config, index) => {
            const y = 30 + index * 30;
            const width = (configStats[config] / Math.max(...Object.values(configStats))) * (canvas.width - 100);
            
            ctx.fillStyle = colors[index % colors.length];
            ctx.fillRect(10, y, width, 25);
            
            ctx.fillStyle = '#1e3a8a';
            ctx.font = '12px Arial';
            ctx.fillText(config, 15, y + 17);
        });
    }

    renderMuscleActivityChart() {
        const canvas = document.getElementById('muscle-activity-chart');
        const ctx = canvas.getContext('2d');
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const muscleStats = {};
        this.data.configurations.forEach(config => {
            const muscleName = this.getMuscleNameById(config.muscleGroup);
            muscleStats[muscleName] = (muscleStats[muscleName] || 0) + 1;
        });
        
        const muscles = Object.keys(muscleStats);
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
        
        muscles.forEach((muscle, index) => {
            const y = 30 + index * 25;
            const width = (muscleStats[muscle] / Math.max(...Object.values(muscleStats))) * (canvas.width - 100);
            
            ctx.fillStyle = colors[index % colors.length];
            ctx.fillRect(10, y, width, 20);
            
            ctx.fillStyle = '#1e3a8a';
            ctx.font = '10px Arial';
            ctx.fillText(muscle, 15, y + 14);
        });
    }

    renderPerformanceSummary() {
        const container = document.getElementById('performance-summary');
        
        const totalSessions = this.data.sessions.length;
        const avgRMS = totalSessions > 0 ? 
            (this.data.sessions.reduce((sum, s) => sum + (s.metrics.RMS || 0), 0) / totalSessions).toFixed(2) : 0;
        const avgMNF = totalSessions > 0 ? 
            (this.data.sessions.reduce((sum, s) => sum + (s.metrics.MNF || 0), 0) / totalSessions).toFixed(1) : 0;
        const bestSNR = totalSessions > 0 ? 
            Math.max(...this.data.sessions.map(s => s.metrics.SNR || 0)).toFixed(1) : 0;
        
        container.innerHTML = `
            <div class="summary-metric">
                <div class="summary-value">${avgRMS}</div>
                <div class="summary-label">Avg RMS (mV)</div>
            </div>
            <div class="summary-metric">
                <div class="summary-value">${avgMNF}</div>
                <div class="summary-label">Avg MNF (Hz)</div>
            </div>
            <div class="summary-metric">
                <div class="summary-value">${bestSNR}</div>
                <div class="summary-label">Best SNR (dB)</div>
            </div>
            <div class="summary-metric">
                <div class="summary-value">${totalSessions}</div>
                <div class="summary-label">Total Sessions</div>
            </div>
        `;
    }

    // Modal Management
    showAddConfigForm() {
        document.getElementById('add-config-modal').classList.add('active');
    }

    hideAddConfigForm() {
        document.getElementById('add-config-modal').classList.remove('active');
    }

    showAddSessionForm() {
        this.setupMetricsInputs();
        this.updateConfigurationDropdown();
        document.getElementById('add-session-form').querySelector('input[name="date"]').value = 
            new Date().toISOString().split('T')[0];
        document.getElementById('add-session-modal').classList.add('active');
    }

    hideAddSessionForm() {
        document.getElementById('add-session-modal').classList.remove('active');
    }

    hideModal(modal) {
        modal.classList.remove('active');
    }

    // Body View Toggle
    showBodyView(view) {
        this.currentBodyView = view;
        
        document.querySelectorAll('.body-view').forEach(v => v.classList.remove('active'));
        document.getElementById(`${view}-body`).classList.add('active');
        
        document.querySelectorAll('.diagram-toggle .btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`${view}-view-btn`).classList.add('active');
    }

    // Utility Functions
    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString();
    }

    getMuscleNameById(id) {
        const allMuscles = [...this.bodyFront, ...this.bodyBack];
        const muscle = allMuscles.find(m => m.id === id);
        return muscle ? muscle.name : id;
    }

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<div class="toast-message">${message}</div>`;
        
        document.getElementById('toast-container').appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 100);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    exportData() {
        const dataToExport = {
            configurations: this.data.configurations,
            sessions: this.data.sessions,
            customMetrics: this.data.customMetrics,
            exportDate: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `emg_dashboard_export_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.showToast('Data exported successfully!', 'success');
    }
}

// Initialize the dashboard
const emgDashboard = new EMGDashboard();

// Global functions for onclick handlers
function navigateToPage(page) {
    emgDashboard.navigateToPage(page);
}

function showAddConfigForm() {
    emgDashboard.showAddConfigForm();
}

function hideAddConfigForm() {
    emgDashboard.hideAddConfigForm();
}

function showAddSessionForm() {
    emgDashboard.showAddSessionForm();
}

function hideAddSessionForm() {
    emgDashboard.hideAddSessionForm();
}

function showBodyView(view) {
    emgDashboard.showBodyView(view);
}

function addCustomMetric() {
    emgDashboard.addCustomMetric();
}

function exportData() {
    emgDashboard.exportData();
}
