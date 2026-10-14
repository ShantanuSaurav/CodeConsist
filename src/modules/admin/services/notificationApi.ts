import { adminRequest } from './adminApi';
export interface NotificationRule { id:string; label:string; enabled:boolean; title:string; body:string; destination:string; hour:number; days:number; weekday:number; target:number }
export interface NotificationOverview {
  configured:boolean; devices:number; rules:NotificationRule[]; destinations:string[];
  users:Array<{id:string;username:string;email:string}>;
  history:Array<{id:string;userId:string;title:string;body:string;category:string;createdAt:string;readAt:string|null;delivery:Record<string,number>}>;
}
export const notificationApi = {
  overview:()=>adminRequest<NotificationOverview>('/admin/notifications'),
  saveRules:(rules:NotificationRule[])=>adminRequest<{rules:NotificationRule[]}>('/admin/notifications/rules',{method:'PUT',body:{rules}}),
  send:(body:{requestId:string;audience:string;userId:string;title:string;body:string;destination:string})=>adminRequest<{accepted:number;audience:number}>('/admin/notifications/send',{method:'POST',body})
};
