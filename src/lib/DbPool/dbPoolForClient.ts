import { Pool } from "pg";

class DBPoolForClient{
    public pool: Pool;

    constructor(){
        this.pool = new Pool()
    }
}

export const dbPoolForClient = new DBPoolForClient().pool