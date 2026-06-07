export declare function hashPassword(password: string): Promise<string>;
export declare function verifyPassword(password: string, hash: string): Promise<boolean>;
export declare function signToken(payload: {
    id: number;
    username: string;
    role: string;
}): Promise<string>;
export declare function verifyToken(token: string): Promise<{
    id: number;
    username: string;
    role: string;
}>;
//# sourceMappingURL=auth.d.ts.map