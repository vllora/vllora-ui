export interface Breakpoint {
  breakpoint_id: string;
  request: unknown;
}

export interface BreakpointsResponse {
  breakpoints: Breakpoint[];
  intercept_all: boolean;
}

export interface SetGlobalBreakpointResponse {
  status: string;
  intercept_all: boolean;
}

export interface BreakpointsState {
  isDebugActive: boolean;
  isLoading: boolean;
  breakpoints: Breakpoint[];
  interceptAll: boolean;
  error: string | null;
}

export interface ContinueBreakpointRequest {
  breakpoint_id: string;
  action: 'continue' | unknown; // 'continue' for original request, or the modified ChatCompletionRequest object
}

export interface ContinueBreakpointResponse {
  status: string;
  breakpoint_id: string;
}
