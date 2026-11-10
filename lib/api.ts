export async function readApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch {}
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : response.status === 413 ? 'Превышен размер загрузки. Файл должен быть не больше 25 МБ.' : 'Сервер не смог выполнить запрос. Попробуйте ещё раз.';
    throw new Error(message);
  }
  if (!data || typeof data !== 'object') throw new Error('Не удалось получить ответ сервера. Попробуйте ещё раз.');
  return data as T;
}
