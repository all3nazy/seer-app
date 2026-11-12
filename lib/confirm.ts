/** Words that make a confirmation's button red («نعم، متأكد») instead of «تأكيد». */
const dangerous = /حذف|إزالة|إيقاف|إلغاء|يمسح|تمسح/;
export const isDangerous = (message: string) => dangerous.test(message);
