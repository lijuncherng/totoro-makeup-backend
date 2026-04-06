/**
 * 路线生成器 - 生成模拟跑步轨迹
 */

// 默认中心点（可配置）
const DEFAULT_CENTER = {
  longitude: 106.6949505,
  latitude: 29.0353885,
};

/**
 * 生成随机跑步轨迹
 * @param distance 距离（公里）
 * @param centerLng 中心经度
 * @param centerLat 中心纬度
 * @param seed 随机种子（可选，用于可重复的路线）
 */
export function generateMockRoute(
  distance: number,
  centerLng: number = DEFAULT_CENTER.longitude,
  centerLat: number = DEFAULT_CENTER.latitude,
  seed?: number
): number[][] {
  const points: number[][] = [];
  const numPoints = Math.floor(distance * 60) + 20; // 每公里约60个点

  let rng: () => number;
  if (seed !== undefined) {
    // 使用种子生成可重复的随机数
    rng = seededRandom(seed);
  } else {
    rng = Math.random;
  }

  let currentLng = centerLng;
  let currentLat = centerLat;
  let angle = rng() * Math.PI * 2; // 初始方向

  for (let i = 0; i < numPoints; i++) {
    // 逐渐形成椭圆形轨迹
    const progress = i / numPoints;
    const radiusScale = 1 + Math.sin(progress * Math.PI * 4) * 0.3; // 波浪形半径

    // 方向逐渐变化，模拟跑圈
    angle += (rng() - 0.5) * 0.3;

    // 基础步长（根据距离和点数计算）
    const baseStep = distance / numPoints * 0.01; // 转换为度数

    // 计算偏移
    const dx = Math.cos(angle) * baseStep * radiusScale;
    const dy = Math.sin(angle) * baseStep * radiusScale;

    // 添加随机抖动
    const jitterLng = (rng() - 0.5) * 0.0001;
    const jitterLat = (rng() - 0.5) * 0.0001;

    currentLng += dx + jitterLng;
    currentLat += dy + jitterLat;

    points.push([
      Math.round(currentLng * 10000000) / 10000000,
      Math.round(currentLat * 10000000) / 10000000,
    ]);
  }

  return points;
}

/**
 * 生成矩形路线（适合操场）
 */
export function generateRectRoute(
  width: number = 0.002,
  height: number = 0.001,
  centerLng: number = DEFAULT_CENTER.longitude,
  centerLat: number = DEFAULT_CENTER.latitude,
  laps: number = 3
): number[][] {
  const points: number[][] = [];

  // 矩形四个角
  const corners = [
    [centerLng - width / 2, centerLat - height / 2],
    [centerLng + width / 2, centerLat - height / 2],
    [centerLng + width / 2, centerLat + height / 2],
    [centerLng - width / 2, centerLat + height / 2],
  ];

  // 每圈点数
  const pointsPerLap = 40;

  for (let lap = 0; lap < laps; lap++) {
    for (let i = 0; i < pointsPerLap; i++) {
      const progress = i / pointsPerLap;
      let cornerIndex = Math.floor(progress * 4);
      let nextCornerIndex = (cornerIndex + 1) % 4;

      let localProgress = (progress * 4) % 1;
      let lng = corners[cornerIndex][0] + (corners[nextCornerIndex][0] - corners[cornerIndex][0]) * localProgress;
      let lat = corners[cornerIndex][1] + (corners[nextCornerIndex][1] - corners[cornerIndex][1]) * localProgress;

      // 添加抖动
      lng += (Math.random() - 0.5) * 0.00005;
      lat += (Math.random() - 0.5) * 0.00005;

      points.push([lng, lat]);
    }
  }

  return points;
}

/**
 * 生成椭圆形路线
 */
export function generateOvalRoute(
  a: number = 0.002,
  b: number = 0.001,
  centerLng: number = DEFAULT_CENTER.longitude,
  centerLat: number = DEFAULT_CENTER.latitude,
  laps: number = 3
): number[][] {
  const points: number[][] = [];
  const pointsPerLap = 60;

  for (let lap = 0; lap < laps; lap++) {
    for (let i = 0; i < pointsPerLap; i++) {
      const angle = (i / pointsPerLap) * Math.PI * 2;
      let lng = centerLng + a * Math.cos(angle);
      let lat = centerLat + b * Math.sin(angle);

      // 添加自然抖动
      lng += (Math.random() - 0.5) * 0.00003;
      lat += (Math.random() - 0.5) * 0.00003;

      points.push([lng, lat]);
    }
  }

  return points;
}

/**
 * 计算两点间距离（米）
 */
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // 地球半径（米）
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 计算轨迹总距离（米）
 */
export function calculateTotalDistance(points: number[][]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += calculateDistance(points[i - 1][1], points[i - 1][0], points[i][1], points[i][0]);
  }
  return total;
}

// 工具函数
function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// 种子随机数生成器
function seededRandom(seed: number): () => number {
  return function() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

/**
 * 从现有轨迹生成平滑的替代轨迹
 */
export function smoothRoute(originalPoints: number[][], targetDistance: number): number[][] {
  if (originalPoints.length < 2) {
    return originalPoints;
  }

  // 计算原始距离
  const originalDistance = calculateTotalDistance(originalPoints) / 1000; // 转换为公里
  const scale = targetDistance / originalDistance;

  // 缩放轨迹
  const centerLng = originalPoints.reduce((sum, p) => sum + p[0], 0) / originalPoints.length;
  const centerLat = originalPoints.reduce((sum, p) => sum + p[1], 0) / originalPoints.length;

  return originalPoints.map(p => [
    centerLng + (p[0] - centerLng) * scale,
    centerLat + (p[1] - centerLat) * scale,
  ]);
}
