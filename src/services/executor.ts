/**
 * 补跑任务执行器 - 回退到 2026-03-21 可用补跑模型
 */
import {
  callTotoroApi,
  getCampusPaper,
  submitRun,
  submitRouteDetail,
  TotoroApiError,
  type TotoroSession,
  type ExecuteParams,
} from './totoro.js';

const DEFAULT_CENTER_LNG = 106.6949505;
const DEFAULT_CENTER_LAT = 29.0353885;

const NON_RETRYABLE_KEYWORDS = [
  '成绩数据异常',
  '数据异常',
  '重复提交',
  '已存在',
  '已打卡',
  '不在补跑时间范围',
  '日期无效',
  '学号不存在',
  'TOKEN',
  '无效',
];

interface SunRunStandard {
  minKm: number;
  maxKm: number;
  minTime: number;
  maxTime: number;
}

const SUNRUN_STANDARDS: Record<string, SunRunStandard> = {
  male: { minKm: 2.0, maxKm: 2.3, minTime: 10, maxTime: 11 },
  female: { minKm: 1.6, maxKm: 1.63, minTime: 10, maxTime: 13 },
};

function getSunrunStandard(sex?: string): SunRunStandard {
  if (sex === '1' || sex?.toLowerCase() === '男' || sex?.toLowerCase() === 'male') {
    return SUNRUN_STANDARDS.male;
  }
  if (sex === '2' || sex?.toLowerCase() === '女' || sex?.toLowerCase() === 'female') {
    return SUNRUN_STANDARDS.female;
  }
  console.warn(`⚠️ [executeMakeup] 未知性别(${sex})，默认使用男生标准`);
  return SUNRUN_STANDARDS.male;
}

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function isRetryableError(message: string): boolean {
  return !NON_RETRYABLE_KEYWORDS.some(kw => message.includes(kw));
}

function calculateSteps(distance: number): number {
  return Math.floor(distance * 1300);
}

function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function getDurationString(startTimeSec: number, endTimeSec: number): string {
  const duration = endTimeSec - startTimeSec;
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = duration % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getDefaultCenter(runPoint?: { longitude?: string; latitude?: string }): { lng: number; lat: number } {
  if (runPoint?.longitude && runPoint?.latitude) {
    return {
      lng: parseFloat(runPoint.longitude),
      lat: parseFloat(runPoint.latitude),
    };
  }
  return { lng: DEFAULT_CENTER_LNG, lat: DEFAULT_CENTER_LAT };
}

function generateOvalRoute(
  a: number,
  b: number,
  cx: number,
  cy: number,
  count: number,
): Array<{ longitude: number; latitude: number; longtitude: number }> {
  const points: Array<{ longitude: number; latitude: number; longtitude: number }> = [];
  for (let i = 0; i <= count; i++) {
    const angle = (2 * Math.PI * i) / count;
    const longitude = cx + a * Math.cos(angle);
    const latitude = cy + b * Math.sin(angle);
    points.push({
      longitude,
      latitude,
      longtitude: longitude,
    });
  }
  return points;
}

export async function executeMakeup(session: TotoroSession, params: ExecuteParams): Promise<any> {
  const {
    routeId,
    taskId,
    customDate,
    customPeriod,
    mileage: _mileageIgnored,
    runPoint,
    centerLng: callerCenterLng,
    centerLat: callerCenterLat,
  } = params;

  const std = getSunrunStandard(session.sex);
  const distance = parseFloat(randomInRange(std.minKm, std.maxKm).toFixed(2));
  const minSeconds = Math.floor(std.minTime * 60);
  const maxSeconds = Math.floor(std.maxTime * 60);
  const avgSecond = (minSeconds + maxSeconds) / 2;
  const stdTime = (maxSeconds - minSeconds) / 3.5;

  let runSeconds = Math.floor(avgSecond + stdTime * (Math.random() * 2 - 1));
  runSeconds = Math.max(minSeconds, Math.min(maxSeconds, runSeconds));

  const avgSpeed = (distance / (runSeconds / 3600)).toFixed(2);

  console.log(
    `🏃 [executeMakeup] 开始补跑: 学号=${session.stuNumber}, 性别=${session.sex || '未知'}, `
    + `日期=${customDate} ${customPeriod}, 里程=${distance}km, 时长=${(runSeconds / 60).toFixed(1)}分钟`,
  );

  try {
    await callTotoroApi('/sunrun/getRunBegin', {
      campusId: session.campusId,
      schoolId: session.schoolId,
      stuNumber: session.stuNumber,
      token: session.token,
    });
    console.log('✅ [executeMakeup] getRunBegin 成功');
  } catch (error: any) {
    console.warn(`⚠️ [executeMakeup] getRunBegin 失败（不影响主流程）: ${error.message}`);
  }

  const makeupDate = new Date(`${customDate}T12:00:00Z`);
  const startTime = new Date(makeupDate);

  if (customPeriod === 'AM') {
    startTime.setUTCHours(22 + Math.floor(Math.random() * 3), Math.floor(Math.random() * 60), 0, 0);
  } else {
    startTime.setUTCHours(6 + Math.floor(Math.random() * 6), Math.floor(Math.random() * 60), 0, 0);
  }

  const endTimeSec = Math.floor(startTime.getTime() / 1000) + runSeconds;
  const durationString = getDurationString(Math.floor(startTime.getTime() / 1000), endTimeSec);

  let pointList: Array<{ longitude: number; latitude: number }> = [];
  let finalRouteId = routeId || '';
  let finalTaskId = taskId || '';
  let signQrcode = '';

  if (runPoint?.pointList && runPoint.pointList.length > 0) {
    pointList = runPoint.pointList.map(p => ({
      longitude: parseFloat(p.longitude),
      latitude: parseFloat(p.latitude),
    }));
    finalRouteId = runPoint.pointId || routeId || '';
    finalTaskId = runPoint.taskId || taskId || '';
    signQrcode = runPoint.signQrcode || runPoint.pointId || routeId || '';
  } else {
    try {
      const paperResult = await getCampusPaper(session);
      const paper = paperResult?.data;

      const pickTaskId = (obj: any): string => {
        const routes = obj?.runPointList || obj?.data?.runPointList || obj?.obj?.runPointList || [];
        return String(
          obj?.taskId
          || obj?.data?.taskId
          || obj?.obj?.taskId
          || routes?.[0]?.taskId
          || finalTaskId
          || '',
        );
      };

      const pickRoute = (obj: any): any => {
        const routes = obj?.runPointList || obj?.data?.runPointList || obj?.obj?.runPointList || [];
        return routes?.[0] || obj?.data || obj;
      };

      const pickPoints = (obj: any): Array<{ longitude: string; latitude: string }> => {
        const route = pickRoute(obj);
        const directPoints = route?.pointList || obj?.pointList || obj?.data?.pointList || [];
        return Array.isArray(directPoints) ? directPoints : [];
      };

      const pickCenter = (obj: any) => {
        const route = pickRoute(obj);
        const lng = parseFloat(
          route?.longitude
          || route?.lng
          || route?.centerLng
          || String(callerCenterLng || DEFAULT_CENTER_LNG),
        );
        const lat = parseFloat(
          route?.latitude
          || route?.lat
          || route?.centerLat
          || String(callerCenterLat || DEFAULT_CENTER_LAT),
        );
        return { lng, lat };
      };

      const route = pickRoute(paper);
      const fetchedPoints = pickPoints(paper);
      const center = pickCenter(paper);

      finalRouteId = String(route?.pointId || route?.routeId || runPoint?.pointId || routeId || '');
      finalTaskId = pickTaskId(paper) || finalTaskId;
      signQrcode = String(route?.signQrcode || route?.pointId || finalRouteId || routeId || '');

      if (fetchedPoints.length > 0) {
        pointList = fetchedPoints.map((p) => ({
          longitude: parseFloat(p.longitude),
          latitude: parseFloat(p.latitude),
        }));
        console.log('[executeMakeup] using campus paper points:', JSON.stringify({
          source: paperResult?.source,
          routeId: finalRouteId,
          taskId: finalTaskId,
          pointCount: pointList.length,
        }, null, 2));
      } else {
        pointList = generateOvalRoute(0.002 * distance, 0.001 * distance, center.lng, center.lat, Math.ceil(distance));
        console.log('[executeMakeup] campus paper had no points, fallback oval:', JSON.stringify({
          source: paperResult?.source,
          routeId: finalRouteId,
          taskId: finalTaskId,
          center,
          pointCount: pointList.length,
        }, null, 2));
      }
    } catch (error: any) {
      const center = {
        lng: callerCenterLng || getDefaultCenter(runPoint).lng,
        lat: callerCenterLat || getDefaultCenter(runPoint).lat,
      };
      pointList = generateOvalRoute(0.002 * distance, 0.001 * distance, center.lng, center.lat, Math.ceil(distance));
      signQrcode = routeId || '';
      console.warn(`[executeMakeup] getCampusPaper failed, fallback oval: ${error.message}`);
    }
  }

  const sunRunReq = {
    token: session.token,
    stuNumber: session.stuNumber,
    campusId: session.campusId,
    schoolId: session.schoolId,
    routeId: finalRouteId,
    taskId: finalTaskId,
    version: '1.2.14',
    runType: '0',
    phoneInfo: '$CN11/iPhone15,4/17.4.1',
    km: distance.toFixed(2),
    steps: calculateSteps(distance),
    avgSpeed,
    usedTime: durationString,
    startTime: formatTime(startTime),
    endTime: formatTime(new Date(endTimeSec * 1000)),
    evaluateDate: `${customDate} ${formatTime(new Date(endTimeSec * 1000))}`,
    ifLocalSubmit: '1',
    LocalSubmitReason: '7.30',
    customDate,
    customPeriod,
    signQrcode,
    flag: '1',
    fitDegree: '1',
    warnFlag: '0',
    warnType: '',
    faceData: '',
    headImage: '',
    mac: 'ios',
    pointList: '',
    sensorString: '',
    baseStation: '',
  };

  console.log('[executeMakeup] submit payload snapshot:', JSON.stringify({
    routeId: sunRunReq.routeId,
    taskId: sunRunReq.taskId,
    customDate: sunRunReq.customDate,
    customPeriod: sunRunReq.customPeriod,
    signQrcode: sunRunReq.signQrcode,
    evaluateDate: sunRunReq.evaluateDate,
    startTime: sunRunReq.startTime,
    endTime: sunRunReq.endTime,
    usedTime: sunRunReq.usedTime,
    km: sunRunReq.km,
    runType: sunRunReq.runType,
    version: sunRunReq.version,
    ifLocalSubmit: sunRunReq.ifLocalSubmit,
    LocalSubmitReason: sunRunReq.LocalSubmitReason,
    pointCount: pointList.length,
  }, null, 2));

  let sunRunRes: any;
  try {
    sunRunRes = await submitRun(sunRunReq, session);
  } catch (error: any) {
    if (error instanceof TotoroApiError) {
      console.error(`❌ [executeMakeup] 龙猫 API 业务错误: code=${error.code}, message=${error.message}`);
      throw error;
    }
    console.error(`❌ [executeMakeup] 网络错误: ${error.message}`);
    throw error;
  }

  console.log('[executeMakeup] submit response:', JSON.stringify(sunRunRes, null, 2));

  const responseCode = sunRunRes?.code;
  const scantronId = sunRunRes?.scantronId || '';

  if (responseCode !== '00' && responseCode !== 'success' && responseCode !== 0 && responseCode !== '0') {
    const errorMsg = sunRunRes?.message || sunRunRes?.msg || `龙猫返回 code=${responseCode}`;
    console.error(`❌ [executeMakeup] 龙猫返回失败: code=${responseCode}, message=${errorMsg}`);
    throw new TotoroApiError(errorMsg, String(responseCode));
  }

  if (!scantronId) {
    console.error('❌ [executeMakeup] 龙猫未返回 scantronId，疑似静默失败');
    throw new TotoroApiError('龙猫未返回 scantronId，疑似静默失败', 'NO_SCANTRON_ID');
  }

  console.log(`✅ [executeMakeup] 提交跑步记录成功: scantronId=${scantronId}`);

  if (pointList.length > 0 && scantronId) {
    const batchSize = 100;
    for (let i = 0; i < pointList.length; i += batchSize) {
      const batch = pointList.slice(i, i + batchSize);
      try {
        const detailRes = await submitRouteDetail(session, scantronId, batch);
        console.log('[executeMakeup] detail response:', JSON.stringify({
          batchIndex: Math.floor(i / batchSize),
          batchSize: batch.length,
          detailRes,
        }, null, 2));
      } catch (error: any) {
        console.warn(`⚠️ [executeMakeup] 提交轨迹批次失败（不影响结果）: ${error.message}`);
      }
      if (i + batchSize < pointList.length) {
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }
    console.log(`✅ [executeMakeup] 轨迹详情全部提交完成，共 ${pointList.length} 个点`);
  }

  return {
    scantronId,
    evaluateDate: customDate,
    customPeriod,
    km: distance.toFixed(2),
    runTime: runSeconds,
    pace: avgSpeed,
    pointCount: pointList.length,
  };
}
