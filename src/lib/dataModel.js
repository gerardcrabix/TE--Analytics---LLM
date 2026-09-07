// Column layout for the flat arrays that make up a "dash" dataset. Usage and
// employee rows are stored as plain arrays (not objects) to keep a dataset
// with tens of thousands of rows cheap to hold in memory and in
// localStorage — the same trick the original prototype used.

export const USAGE_COL = {
  EMAIL: 0,
  MONTH: 1,
  COUNTRY: 2,
  REGION: 3,
  SEGMENT: 4,
  JOB_FAMILY: 5,
  JOB_FUNCTION: 6,
  CHATGPT: 7,
  COPILOT: 8,
  TELME: 9,
  TOTAL: 10,
  JOB_FUNC_DESC: 11,
  JOB_DESC: 12,
  BU: 13,
  OP_STATUS: 14,
  USER_TYPE: 15,
};

export const EMP_COL = {
  EMAIL: 0,
  USER_ID: 1,
  NAME: 2,
  TITLE: 3,
  SUPERVISOR: 4,
};

export function createEmptyDash() {
  return {
    months: [],
    dicts: {
      emails: [],
      countries: [],
      regions: [],
      segments: [],
      jobFunctions: [],
      businessUnits: [],
      operatorStatuses: [],
      jobFamilies: [],
      jobFunctionDescriptions: [],
      jobDescriptions: [],
      userTypes: [],
    },
    usage: [],
    employees: [],
  };
}

export function isDashEmpty(dash) {
  return !dash || (dash.usage.length === 0 && dash.employees.length === 0);
}
