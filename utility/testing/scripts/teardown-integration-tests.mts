import * as sh from "shelljs";
sh.config.fatal = true;
sh.config.verbose = true;

if (process.env.SKIP_DB_TEARDOWN !== "true") {
    console.log("Killing PostgreSQL database...");
    sh.exec("docker rm -f bowser_test_postgres");
}