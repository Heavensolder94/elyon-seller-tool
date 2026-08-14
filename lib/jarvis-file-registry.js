const MANAGED_JARVIS_FILES = Object.freeze([
  Object.freeze({
    key: "brain.identity",
    path: "brain/IDENTITY.md",
    category: "brain",
    title: "Identity",
    format: "markdown",
    protected: true,
    required: true,
  }),
  Object.freeze({
    key: "brain.elyon_context",
    path: "brain/ELYON_CONTEXT.md",
    category: "brain",
    title: "Elyon Context",
    format: "markdown",
    protected: false,
    required: false,
  }),
  Object.freeze({
    key: "brain.operating_rules",
    path: "brain/OPERATING_RULES.md",
    category: "policy",
    title: "Operating Rules",
    format: "markdown",
    protected: true,
    required: true,
  }),
  Object.freeze({
    key: "brain.capabilities",
    path: "brain/CAPABILITIES.md",
    category: "policy",
    title: "Capabilities",
    format: "markdown",
    protected: true,
    required: false,
  }),
  Object.freeze({
    key: "brain.goals",
    path: "brain/GOALS.md",
    category: "brain",
    title: "Goals",
    format: "markdown",
    protected: false,
    required: true,
  }),
  Object.freeze({
    key: "brain.playbooks",
    path: "brain/PLAYBOOKS.md",
    category: "playbook",
    title: "Playbooks",
    format: "markdown",
    protected: false,
    required: false,
  }),
]);

const MANAGED_JARVIS_FILES_BY_PATH = new Map(MANAGED_JARVIS_FILES.map((entry) => [entry.path, entry]));
const MANAGED_JARVIS_FILES_BY_KEY = new Map(MANAGED_JARVIS_FILES.map((entry) => [entry.key, entry]));

function text(value, max = 300) {
  const output = String(value ?? "").trim();
  return output.length > max ? output.slice(0, max) : output;
}

function getManagedJarvisFileDefinition(identifier) {
  const value = text(identifier);
  if (!value) return null;
  return MANAGED_JARVIS_FILES_BY_PATH.get(value) || MANAGED_JARVIS_FILES_BY_KEY.get(value) || null;
}

function isManagedJarvisFile(identifier) {
  return Boolean(getManagedJarvisFileDefinition(identifier));
}

function listManagedJarvisFiles() {
  return MANAGED_JARVIS_FILES.map((entry) => ({ ...entry }));
}

export {
  MANAGED_JARVIS_FILES,
  getManagedJarvisFileDefinition,
  isManagedJarvisFile,
  listManagedJarvisFiles,
};
