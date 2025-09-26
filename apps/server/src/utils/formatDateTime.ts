import dayjs from 'dayjs';

export function formatDateTime(src?: dayjs.ConfigType) {
  return dayjs(src).format('YYYY-MM-DDThh:mm:ss.sssZ');
}
