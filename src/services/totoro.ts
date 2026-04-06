/**
 * 龙猫 API 服务 - 按 2026-03-21 可用补跑模型回退
 */
import { encryptRequestContent } from './encryption.js';

const TOTORO_API_URL = 'https://app.xtotoro.com/app';
const TOTORO_USER_AGENT = 'TotoroSchool/1.2.14 (iPhone; iOS 17.4.1; Scale/3.00)';

export interface TotoroSession {
  campusId: string;
  schoolId: string;
  stuNumber: string;
  token: string;
  phoneNumber?: string;
  sex?: string;
}

export interface RunPoint {
  pointId?: string;
  taskId?: string;
  pointName?: string;
  longitude?: string;
  latitude?: string;
  pointList?: Array<{ longitude: string; latitude: string }>;
  signQrcode?: string;
}

export interface ExecuteParams {
  routeId?: string;
  taskId?: string;
  customDate: string;
  customPeriod: 'AM' | 'PM';
  mileage: string;
  minTime?: string;
  maxTime?: string;
  runPoint?: RunPoint;
  startDate?: string;
  centerLng?: number;
  centerLat?: number;
}

export class TotoroApiError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'TotoroApiError';
  }
}

function isTotoroBizError(data: any): boolean {
  const code = data?.code;
  return code !== undefined && code !== '00' && code !== 'success' && code !== 0 && code !== '0';
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3,
  retryDelay = 2000,
): Promise<Response> {
  let lastError: any;

  for (let i = 1; i <= retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);

      if (response.status >= 500 && i < retries) {
        const delay = retryDelay * Math.pow(2, i - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error: any) {
      lastError = error;
      if (i < retries) {
        const delay = retryDelay * Math.pow(2, i - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export async function callTotoroApi(path: string, body: Record<string, any>): Promise<any> {
  console.log(`[totoro.call] path=${path}`);
  const encryptedBody = await encryptRequestContent(body);

  const response = await fetchWithRetry(`${TOTORO_API_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      Host: 'app.xtotoro.com',
      Connection: 'keep-alive',
      'User-Agent': TOTORO_USER_AGENT,
      Accept: 'application/json',
    },
    body: encryptedBody,
  });

  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    console.log(`[totoro.call] non-json response path=${path} status=${response.status} body=${text.slice(0, 400)}`);
    return { raw: text, status: response.status };
  }

  console.log(`[totoro.call] response path=${path}: ${JSON.stringify(data).slice(0, 1000)}`);

  if (isTotoroBizError(data)) {
    throw new TotoroApiError(
      data.message || data.msg || `龙猫返回错误: ${data.code}`,
      String(data.code),
    );
  }

  return data;
}

export async function submitRun(runData: Record<string, any>, session: TotoroSession) {
  const data = {
    ...runData,
    campusId: session.campusId,
    schoolId: session.schoolId,
    stuNumber: session.stuNumber,
    token: session.token,
  };
  return callTotoroApi('/platform/recrecord/sunRunExercises', data);
}

export async function submitRouteDetail(
  session: TotoroSession,
  scantronId: string,
  pointList: Array<{ longitude: number; latitude: number }>,
) {
  let lastError: any;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${TOTORO_API_URL}/platform/recrecord/sunRunExercisesDetail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Host: 'app.xtotoro.com',
          'User-Agent': TOTORO_USER_AGENT,
        },
        body: JSON.stringify({
          pointList,
          scantronId,
          stuNumber: session.stuNumber,
          token: session.token,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const text = await response.text();
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text, status: response.status };
      }
    } catch (error: any) {
      lastError = error;
      if (attempt < 3) {
        const delay = 2000 * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  console.warn(`⚠️ 提交轨迹详情失败（scantronId=${scantronId}）: ${lastError?.message}`);
  return { code: 'NETWORK_ERROR' };
}

export async function verifyToken(session: TotoroSession): Promise<boolean> {
  try {
    const result = await callTotoroApi('/user/userInfo', session);
    return result && (result.code === '00' || result.status === 'success');
  } catch {
    return false;
  }
}

export async function getCampusPaper(session: TotoroSession): Promise<any> {
  const commonBody = {
    campusId: session.campusId,
    schoolId: session.schoolId,
    stuNumber: session.stuNumber,
    token: session.token,
  };

  const tryEncryptedEndpoint = async (path: string) => {
    const encryptedBody = await encryptRequestContent(commonBody);
    const response = await fetch(`${TOTORO_API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        Host: 'app.xtotoro.com',
        Connection: 'keep-alive',
        'User-Agent': 'okhttp/4.9.0',
        Accept: 'application/json',
      },
      body: encryptedBody,
    });
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text, status: response.status };
    }
  };

  try {
    const freerun = await tryEncryptedEndpoint('/sunrun/getFreerunPaper');
    console.log(`[totoro.paper] raw getFreerunPaper: ${JSON.stringify(freerun).slice(0, 1200)}`);
    const hasFreerunData =
      freerun?.taskId
      || freerun?.data?.taskId
      || freerun?.pointList?.length
      || freerun?.data?.pointList?.length
      || freerun?.runPointList?.length
      || freerun?.data?.runPointList?.length;
    if (hasFreerunData) {
      console.log(`[totoro.paper] using freerun paper: ${JSON.stringify(freerun).slice(0, 600)}`);
      return { source: 'freerun', data: freerun };
    }
  } catch (error: any) {
    console.warn(`[totoro.paper] getFreerunPaper failed: ${error.message}`);
  }

  try {
    const sunrun = await tryEncryptedEndpoint('/sunrun/getSunrunPaper');
    console.log(`[totoro.paper] raw getSunrunPaper: ${JSON.stringify(sunrun).slice(0, 1200)}`);
    const hasSunrunData =
      sunrun?.taskId
      || sunrun?.data?.taskId
      || sunrun?.pointList?.length
      || sunrun?.data?.pointList?.length
      || sunrun?.runPointList?.length
      || sunrun?.data?.runPointList?.length;
    if (hasSunrunData) {
      console.log(`[totoro.paper] using sunrun paper: ${JSON.stringify(sunrun).slice(0, 600)}`);
      return { source: 'sunrun', data: sunrun };
    }
  } catch (error: any) {
    console.warn(`[totoro.paper] getSunrunPaper failed: ${error.message}`);
  }

  console.log('[totoro.paper] no campus paper data found');
  return { source: 'none', data: null };
}
