import React from "react";
import { Download, FileText, Table } from "lucide-react";
import { NDA_DATA_STRUCTURES } from "@/const";

const DownloadStructureButton = ({ shortName }) => {
    const download = () => {
        window.location.href = `${NDA_DATA_STRUCTURES}/${shortName}/csv`;
    };

    return (
        // <button
        //     onClick={download}
        //     className="flex items-center justify-center w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors group"
        // >
        //     <FileText className="w-4 h-4 mr-2 text-white" />
        //     <span>Data Definition</span>
        // </button>
        <button
            onClick={download}
            className="flex items-center justify-center w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors group"
        >
            <FileText className="w-4 h-4 mr-2 text-gray-500 group-hover:text-gray-700" />
            <span>Data Structure</span>
        </button>
    );
};

export default DownloadStructureButton;
