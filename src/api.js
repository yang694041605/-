const API_BASE =
  globalThis.XYING_API_BASE ||
  (location.protocol === "file:" ? "http://127.0.0.1:4173" : "");

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body instanceof Blob ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    }
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `请求失败：${response.status}`);
  }
  return payload;
}

export const api = {
  base: API_BASE,
  health: () => request("/api/health"),
  bootstrap: () => request("/api/bootstrap"),
  listJobs: () => request("/api/jobs"),
  getJob: (jobId) => request(`/api/jobs/${encodeURIComponent(jobId)}`),
  queryJob: (jobId) =>
    request(`/api/jobs/${encodeURIComponent(jobId)}/query`, { method: "POST" }),
  updateProject: (projectId, patch) =>
    request(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "PUT",
      body: JSON.stringify(patch)
    }),
  getProjectTimeline: (projectId, mode = "story") =>
    request(
      `/api/projects/${encodeURIComponent(projectId)}/timeline?mode=${encodeURIComponent(mode)}`
    ),
  approveProjectStep: (projectId, payload) =>
    request(`/api/projects/${encodeURIComponent(projectId)}/workflow/approve`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateShot: (projectId, shotId, patch) =>
    request(
      `/api/projects/${encodeURIComponent(projectId)}/shots/${encodeURIComponent(shotId)}`,
      {
        method: "PUT",
        body: JSON.stringify(patch)
      }
    ),
  createProject: (project) =>
    request("/api/projects", {
      method: "POST",
      body: JSON.stringify(project)
    }),
  uploadProjectPhoto: async (projectId, role, file) =>
    request(
      `/api/projects/${encodeURIComponent(projectId)}/photos?role=${encodeURIComponent(
        role
      )}&name=${encodeURIComponent(file.name)}`,
      {
        method: "POST",
        body: file
      }
    ),
  uploadAsset: async (file, { kind = "project-photo", projectId = "", title = "" } = {}) =>
    request(
      `/api/assets/upload?kind=${encodeURIComponent(kind)}&projectId=${encodeURIComponent(
        projectId
      )}&name=${encodeURIComponent(file.name)}&title=${encodeURIComponent(title || file.name)}`,
      { method: "POST", body: file }
    ),
  deleteAsset: (assetId) =>
    request(`/api/assets/${encodeURIComponent(assetId)}`, {
      method: "DELETE"
    }),
  uploadTemplate: async (file, title = file.name) =>
    request(`/api/templates/upload?name=${encodeURIComponent(file.name)}&title=${encodeURIComponent(title)}`, {
      method: "POST",
      body: file
    }),
  importTemplateUrl: (url) =>
    request("/api/templates/import-url", {
      method: "POST",
      body: JSON.stringify({ url })
    }),
  analyzeTemplate: (templateId, deep = false) =>
    request(`/api/templates/${encodeURIComponent(templateId)}/analyze`, {
      method: "POST",
      body: JSON.stringify({ deep })
    }),
  applyTemplate: (templateId, projectId) =>
    request(`/api/templates/${encodeURIComponent(templateId)}/apply`, {
      method: "POST",
      body: JSON.stringify({ projectId })
    }),
  createTemplateClip: (templateId, payload) =>
    request(`/api/templates/${encodeURIComponent(templateId)}/clip`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  extractRemixFrames: (templateId) =>
    request(`/api/templates/${encodeURIComponent(templateId)}/remix/extract`, {
      method: "POST",
      body: JSON.stringify({})
    }),
  analyzeRemixTemplate: (templateId) =>
    request(`/api/templates/${encodeURIComponent(templateId)}/remix/analyze`, {
      method: "POST",
      body: JSON.stringify({})
    }),
  updateRemixTargets: (projectId, payload) =>
    request(`/api/projects/${encodeURIComponent(projectId)}/remix/targets`, {
      method: "PUT",
      body: JSON.stringify(payload)
    }),
  updateModel: (modelId, patch) =>
    request(`/api/models/${encodeURIComponent(modelId)}`, {
      method: "PUT",
      body: JSON.stringify(patch)
    }),
  getModels: () => request("/api/models"),
  createModel: (model) =>
    request("/api/models", {
      method: "POST",
      body: JSON.stringify(model)
    }),
  deleteModel: (modelId) =>
    request(`/api/models/${encodeURIComponent(modelId)}`, {
      method: "DELETE"
    }),
  setDefaultModel: (modelId) =>
    request(`/api/models/${encodeURIComponent(modelId)}/default`, {
      method: "POST",
      body: JSON.stringify({})
    }),
  testModel: (modelId) =>
    request(`/api/models/${encodeURIComponent(modelId)}/test`, { method: "POST" }),
  generateText: (payload) =>
    request("/api/generate/text", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  generateImage: (payload) =>
    request("/api/generate/image", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  generateVideo: (payload) =>
    request("/api/generate/video", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  generateLook: (lookId, payload = {}) =>
    request(`/api/looks/${encodeURIComponent(lookId)}/generate`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  generateVoice: (payload) =>
    request("/api/voice/generate", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  generateMusic: (payload) =>
    request("/api/music/generate", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  generateSubtitles: (payload) =>
    request("/api/subtitles", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  render: (payload) =>
    request("/api/render", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  renderProductionTimeline: (projectId, payload = {}) =>
    request(`/api/projects/${encodeURIComponent(projectId)}/render-timeline`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  renderMixSample: (projectId, payload = {}) =>
    request(`/api/projects/${encodeURIComponent(projectId)}/mix/sample`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  renderFullMix: (projectId, payload = {}) =>
    request(`/api/projects/${encodeURIComponent(projectId)}/mix/full`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  renderPreview: (projectId, payload = {}) =>
    request(`/api/projects/${encodeURIComponent(projectId)}/preview`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  createDelivery: (projectId, payload = {}) =>
    request(`/api/projects/${encodeURIComponent(projectId)}/delivery`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  createVvvProject: (payload) =>
    request("/api/vvv/project", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  mediaUrl: (localPath) => {
    if (!localPath) return "";
    if (/^https?:\/\//.test(localPath) || localPath.startsWith("data:")) return localPath;
    if (localPath.startsWith("/media/")) return `${API_BASE}${localPath}`;
    const normalized = localPath.replaceAll("\\", "/");
    const marker = "/data/media/";
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex >= 0) {
      return `${API_BASE}/media/${normalized.slice(markerIndex + marker.length)}`;
    }
    return localPath;
  }
};

export function waitForJob(jobId, onUpdate, { interval = 1500, timeout = 30 * 60 * 1000 } = {}) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const payload = await api.getJob(jobId);
        const job = payload.item;
        onUpdate?.(job);
        if (job.status === "succeeded") {
          resolve(job);
          return;
        }
        if (["failed", "cancelled"].includes(job.status)) {
          reject(new Error(job.error || `任务状态：${job.status}`));
          return;
        }
        if (Date.now() - startedAt > timeout) {
          reject(new Error(`任务 ${jobId} 仍在运行，请稍后到任务中心查询原任务`));
          return;
        }
        setTimeout(tick, interval);
      } catch (error) {
        reject(error);
      }
    };
    tick();
  });
}
