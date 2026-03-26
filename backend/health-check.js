const jwt=require("jsonwebtoken");
const http=require("http");
const t=jwt.sign({userId:"admin",role:"ADMIN"},"integrame-secret-key-2024",{expiresIn:"1h"});
const opts={hostname:"localhost",port:4000,path:"/api/admin/simulated-players/health",headers:{Authorization:"Bearer "+t}};
http.get(opts,res=>{let d="";res.on("data",c=>d+=c);res.on("end",()=>{require("fs").writeFileSync("health-out.json",d);});}).on("error",e=>require("fs").writeFileSync("health-out.json","ERROR:"+e.message));
