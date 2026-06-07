export type AuthUser = {
    id: number;
    username: string;
    role: string;
};
export declare const authMiddleware: import("hono").MiddlewareHandler<{
    Variables: {
        user: AuthUser;
    };
}, string, {}, Response>;
export declare const requireRole: (...roles: string[]) => import("hono").MiddlewareHandler<{
    Variables: {
        user: AuthUser;
    };
}, string, {}, Response>;
//# sourceMappingURL=auth.d.ts.map