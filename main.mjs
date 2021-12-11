import fetch from "node-fetch";
import yargs from "yargs";
import * as fs from "fs";
import * as Path from "path";
import * as child_process from "child_process";
import * as os from "os";

const URL_GCC = "https://ftp.gnu.org/gnu/gcc/gcc-11.2.0/gcc-11.2.0.tar.xz";
const URL_BINUTILS = "https://ftp.gnu.org/gnu/binutils/binutils-2.37.tar.xz";
const URL_GDB = "https://ftp.gnu.org/gnu/gdb/gdb-11.1.tar.xz";
const URL_NEWLIB = "https://sourceware.org/pub/newlib/newlib-4.1.0.tar.gz";

const argv = yargs(process.argv)
	.option('machine-code-mode', {
		alias: 'm',
		type: 'string',
		demandOption: true,
		default: 'mips32',
		describe: 'Machine code mode.',
		choices: ['mips32', 'micromips', 'mips16e']
	})
	.option('output-directory', {
		alias: 'o',
		type: 'string',
		demandOption: true,
		describe: 'Output directory for the toolchain being built',
	})
	.option('temp-directory', {
		alias: 'T',
		type: 'string',
		demandOption: true,
		default: '/tmp/',
		describe: 'Temporary directory',
	})
	.option('url-gcc', {
		type: 'string',
		demandOption: true,
		default: URL_GCC,
		describe: 'URL for downloading GCC',
	})
	.option('url-binutils', {
		type: 'string',
		demandOption: true,
		default: URL_BINUTILS,
		describe: 'URL for downloading binutils',
	})
	.option('url-gdb', {
		type: 'string',
		demandOption: true,
		default: URL_GDB,
		describe: 'URL for downloading GDB',
	})
	.option('url-newlib', {
		type: 'string',
		demandOption: true,
		default: URL_NEWLIB,
		describe: 'URL for downloading newlib',
	})
	.option('compile-flags', {
		alias: 'f',
		type: 'string',
		describe: 'Overrides CFLAGS and CXXFLAGS'
	})
	.option('target-compile-flags', {
		alias: 'F',
		type: 'string',
		describe: 'Overrides CFLAGS_FOR_TARGET and CXXFLAGS_FOR_TARGET. Option "-m" will be ignored'
	})
	.option('fortune', {
		type: "bool",
		default: false,
		describe: 'Show some random words',
	})
	.usage('$0 OPTIONS...', 'The Ultimate PIC32 Toolchain Builder')
	.count('fortune')
	.version()
	.alias('v', 'version')
	.help('help')
	.alias('h', 'help')
	.epilogue('This program uses AGPLv3 license.\nCopyright (C) 2021 SudoMaker. All rights reserved.')
	.wrap(null)
	.argv;

const baseDir = Path.join(argv.tempDirectory, "pic32-toolchain-builder");
const buildDir = Path.join(baseDir, "build");
const downloadCacheDir = Path.join(baseDir, "downloads");
const outputDir = argv.outputDirectory;


const downloadStats = {};

const doDownload = () => Promise.all([argv.urlGcc, argv.urlGdb, argv.urlBinutils, argv.urlNewlib].map(it => {
		const controller = new AbortController();
		const {signal} = controller;
		return fetch(it, {signal})
			.then((resp) => {
				const bodyStream = resp.body;
				const remoteSize = parseInt(resp.headers.get('content-length'));
				const filename = (new URL(it)).pathname.split('/').pop();
				const filePath = Path.join(downloadCacheDir, filename);
				let sbuf = null;

				try {
					sbuf = fs.statSync(filePath);
				} catch (e) {

				}

				const pDownloadStat = {
					downloaded: 0,
					total: remoteSize
				};

				downloadStats[filename] = pDownloadStat;

				if (sbuf && sbuf.size === remoteSize) {
					controller.abort();
					pDownloadStat.downloaded = remoteSize;
					return;
				}

				const ws = fs.createWriteStream(filePath);

				bodyStream.pipe(ws);

				bodyStream.on('data', (chunk) => {
					pDownloadStat.downloaded += chunk.length;
				});

				return new Promise((resolve) => {
					bodyStream.on('end', () => {
						resolve();
					});
				})
			})
	}
));

const showDownloadStats = () => {
	const entries = Object.entries(downloadStats);
	console.clear();
	console.log('===== Downloading files =====');
	for (let [filename, status] of entries) {
		const percent = 100 * status.downloaded / status.total;
		console.log(`${filename}: ${status.downloaded}/${status.total} ${percent.toFixed(3)}%`);
	}
}

const extractOne = (tag, url) => {
	console.log(`Extracting ${tag} ...`);
	const destPath = Path.join(buildDir, `/${tag}`);
	fs.mkdirSync(destPath, {recursive: true});

	const archivePath = Path.join(downloadCacheDir, (new URL(url)).pathname.split('/').pop());

	child_process.spawnSync('tar', ['-C', destPath, '-xvf', archivePath], {
		stdio: ['ignore', process.stdout, process.stderr]
	});

}

const doExtract = () => {
	extractOne("gcc", argv.urlGcc);
	extractOne("gdb", argv.urlGdb);
	extractOne("binutils", argv.urlBinutils);
	extractOne("newlib", argv.urlNewlib);
}

const determineSrcDirName = (tag) => {
	const destPath = Path.join(buildDir, tag);
	const files = fs.readdirSync(destPath);

	for (let it of files) {
		if (it !== "build") {
			return Path.join(destPath, it);
		}
	}

	throw "Failed to determine source dir";
}

const makeAndInstall = (tag, env) => {
	const p1 = child_process.spawnSync(
		"make",
		["-j", os.cpus().length.toString()],
		{
			stdio: "inherit",
			env: env
		}
	);

	if (p1.status !== 0) {
		console.log(`error: ${tag} build failed`);
		process.exit(2);
	}

	const p2 = child_process.spawnSync(
		"make",
		["install"],
		{
			stdio: "inherit",
			env: env
		}
	);

	if (p2.status !== 0) {
		console.log(`error: ${tag} install failed`);
		process.exit(2);
	}
}

const deleteDir = (path) => {
	const p1 = child_process.spawnSync(
		"rm",
		["-rf", path],
		{
			stdio: "inherit"
		}
	);

	if (p1.status !== 0) {
		console.log(`error: ${path} delete failed`);
		process.exit(2);
	}
}

const buildGCC = (environ, srcDirNewlib) => {
	const srcDirGCC = determineSrcDirName("gcc");
	console.log(`Source directory of GCC: ${srcDirGCC}`);
	process.chdir(Path.join(buildDir, "gcc"));
	deleteDir("build");
	fs.mkdirSync("build", {recursive: true});
	process.chdir("build");
	const cmdConfigureGCC = Path.join(srcDirGCC, "/configure");
	const argsConfigureGCC = [
		"--target", "mipsel-elf",
		"--prefix=" + outputDir,
		"--disable-nls",
		"--disable-shared",
		"--enable-offload-target=x86_64-pc-linux-gnu",
		"--disable-bootstrap",
		"--with-newlib",
		"--enable-languages=c,c++"
	];

	if (srcDirNewlib) {
		argsConfigureGCC.push("--with-headers=" + Path.join(srcDirNewlib, "/newlib/libc/include"));
	}

	console.log(cmdConfigureGCC);
	console.log(argsConfigureGCC);

	const p0 = child_process.spawnSync(
		cmdConfigureGCC,
		argsConfigureGCC,
		{
			stdio: "inherit",
			env: environ
		}
	);

	if (p0.status !== 0) {
		console.log("error: GCC configure failed");
		process.exit(2);
	}

	makeAndInstall("gcc", environ);

}

const doBuild = () => {
	console.log(`Output directory: ${outputDir}`);

	let environ = Object.assign({}, process.env);
	environ.PATH = Path.join(outputDir, "/bin") + ":" + environ.PATH;

	let cflags;

	if (argv.targetCompileFlags) {
		cflags = argv.targetCompileFlags;
	} else {
		cflags = "-Os -mfp64 -march=mips32r2 ";

		switch (argv.machineCodeMode) {
			case "micromips":
				cflags += "-mmicromips -minterlink-compressed";
				break;
			case "micromips-only":
				cflags += "-mmicromips -mno-interlink-compressed";
				break;
			case "mips16e":
				cflags += "-mips16 -minterlink-compressed";
				break;
		}
	}

	environ.CFLAGS_FOR_TARGET = cflags;
	environ.CXXFLAGS_FOR_TARGET = cflags;

	if (argv.compileFlags) {
		environ.CFLAGS = environ.CXXFLAGS = argv.compileFlags;
	}

	// child_process.spawnSync('node', ['-pe', 'process.env.PATH'], {
	// 	env: environ,
	// 	stdio: 'inherit'
	// });
	//
	// process.exit(1);
	//
	//
	{
		const srcDirBinutils = determineSrcDirName("binutils");
		console.log(`Source directory of binutils: ${srcDirBinutils}`);

		process.chdir(Path.join(buildDir, "binutils"));
		deleteDir("build");
		fs.mkdirSync("build", {recursive: true});
		process.chdir("build");

		const p0 = child_process.spawnSync(
			Path.join(srcDirBinutils, "/configure"),
			[
				"--target", "mipsel-elf",
				"--prefix=" + outputDir
			],
			{
				stdio: "inherit",
				env: environ
			}
		);

		if (p0.status !== 0) {
			console.log("error: binutils configure failed");
			process.exit(2);
		}

		makeAndInstall("binutils", environ);
	}


	{
		const srcDirNewlib = determineSrcDirName("newlib");
		console.log(`Source directory of newlib: ${srcDirNewlib}`);

		{
			buildGCC(environ, srcDirNewlib);
		}

		process.chdir(Path.join(buildDir, "newlib"));
		deleteDir("build");
		fs.mkdirSync("build", {recursive: true});
		process.chdir("build");
		const cmdConfigureNewlib = Path.join(srcDirNewlib, "/configure");

		const argsConfigureNewlib = [
			"--target", "mipsel-elf",
			"--prefix=" + outputDir,
			"--disable-newlib-supplied-syscalls"
		];

		const p0 = child_process.spawnSync(
			cmdConfigureNewlib,
			argsConfigureNewlib,
			{
				stdio: "inherit",
				env: environ
			}
		);

		if (p0.status !== 0) {
			console.log("error: newlib configure failed");
			process.exit(2);
		}

		makeAndInstall("newlib", environ);

		// {
		// 	buildGCC(environ, null);
		// }
	}

	{
		const srcDirGDB = determineSrcDirName("gdb");
		console.log(`Source directory of GDB: ${srcDirGDB}`);


		process.chdir(Path.join(buildDir, "gdb"));
		deleteDir("build");
		fs.mkdirSync("build", {recursive: true});
		process.chdir("build");
		const cmdConfigureGDB = Path.join(srcDirGDB, "/configure");
		const argsConfigureGDB = [
			"--target", "mipsel-elf",
			"--prefix=" + outputDir
		];

		const p0 = child_process.spawnSync(
			cmdConfigureGDB,
			argsConfigureGDB,
			{
				stdio: "inherit",
				env: environ
			}
		);

		if (p0.status !== 0) {
			console.log("error: GDB configure failed");
			process.exit(2);
		}

		makeAndInstall("gdb", environ);
	}


}

function getRandomInt(min, max) {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(Math.random() * (max - min) + min);
}

const showFortune = () => {
	const fortunes = [
		"Warm Regards.",
		"Happy to help.",

		"We don’t have a technical support available for IQ interface of AT86RF215.",

		"You have compiled in FREE mode",

		"Priority support is only available for customer's with an active HPA - High Priority Access",
		"We have checked from our end, the compiler built from the source code builds our test codes fine.",
		"Is there a reason you can't use the MPLAB XC16 compiler instalation?",
		"We do not provide support on compilers built from source. If you use an MPLAB XC compiler, please feel free to contact us with any questions or concerns."
	];

	console.log(fortunes[getRandomInt(0, fortunes.length - 1)]);
}

const main = async () => {

	if (argv.fortune) {
		showFortune();
		process.exit(233);
	}

	fs.mkdirSync(downloadCacheDir, {recursive: true});
	fs.mkdirSync(outputDir, {recursive: true});

	let intervalId = setInterval(showDownloadStats, 1000);

	await doDownload();

	clearInterval(intervalId);
	showDownloadStats();

	console.log("All files downloaded!")

	doExtract();
	doBuild();

	console.log(`Now please copy "pic32m-bin2hex" from XC32 installation to ${outputDir}/bin and you're done!`);
}

export {main}